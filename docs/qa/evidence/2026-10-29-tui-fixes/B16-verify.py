"""PTY repro only: requires a disposable, onboarded QA server and an already loaded model."""
import os,sys,json,pty,select,fcntl,termios,struct,signal,re,time,pathlib,subprocess,uuid
import argparse
args=argparse.ArgumentParser(description=__doc__);args.add_argument('--binary',required=True);args.add_argument('--data-folder',required=True);parsed=args.parse_args()
folder=str(pathlib.Path(parsed.data_folder).resolve())
if '/atomic-qa-' not in folder:raise SystemExit('Use a disposable atomic-qa-* data folder.')
m={'binary':str(pathlib.Path(parsed.binary).resolve()),'base':str(pathlib.Path(folder).parent),'data':folder}
env=os.environ.copy();env.update(ATC_DATA_FOLDER=folder,ATOMIC_CORE_DATA_FOLDER=m['base']+'/app-data',NO_COLOR='1',TERM='xterm-256color')
def call(op,value={}):
 r=subprocess.run([m['binary'],'--data-folder',folder,'control','call',op,'--input',json.dumps(value),'--json'],env=env,capture_output=True,text=True,check=True)
 return json.loads(r.stdout)['result']
pid,fd=pty.fork()
if pid==0:os.execve(m['binary'],[m['binary'],'--data-folder',folder],env)
fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0));os.kill(pid,signal.SIGWINCH)
out=b'';ansi=re.compile(rb'\x1b\[[0-?]*[ -/]*[@-~]')
def frame():
 i=out.rfind(b'\x1b[2K');j=out.find(b'\x1b[G',i) if i>=0 else -1;k=out.rfind(b'\x1b[?1049h')
 start=j+3 if j>=0 else (i+4 if i>=0 else k+8 if k>=0 else 0)
 return ansi.sub(b'',out[start:]).decode('utf8','replace').replace('\r','')
def pump(check=lambda:False,timeout=8):
 global out
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if check():return True
  r,_,_=select.select([fd],[],[],.03)
  if r:
   try:data=os.read(fd,262144)
   except OSError:return False
   if not data:return False
   out+=data
 return check()
def wait(label):
 if not pump(lambda:label in frame()):raise RuntimeError('Not visible: '+label+'\n'+frame())
def click(label):
 wait(label);rows=frame().split('\n');x,y=[(row.rfind(label),y) for y,row in enumerate(rows) if label in row][0]
 before=len(out)
 os.write(fd,('\x1b[<0;%d;%dM'%(x+1,y+1)).encode())
 pump(lambda:len(out)>before,2)

ev=pathlib.Path.cwd()/'docs/qa/evidence/2026-10-29-tui-fixes'
def picker():
 pump(lambda:False,.5)
 rows=frame().split('\n'); y,row=next((y,row) for y,row in enumerate(rows) if '+ Files' in row)
 x=row.index('+ Files')+18
 os.write(fd,('\x1b[<0;%d;%dM'%(x+1,y+1)).encode());wait('Choose a model')
def loaded():
 if not pump(lambda:'Model loaded.' in frame(),80):raise RuntimeError('Load not finished\n'+frame())
try:
 wait('Agents & tools');click('Playground');wait('Write a message')
 picker();click('LFM2.5-1.2B-Instruct-Q4_K_M');loaded()
 picker();click('Inference engine');wait('llama.cpp TurboQuant');click('llama.cpp TurboQuant')

 if not pump(lambda:'TurboQuant selected.' in frame(),80):raise RuntimeError(frame())
 (ev/'B16-turboquant-model.txt').write_text(frame()+'\n')
 picker();click('Inference engine');wait('TurboQuant')
 if '✓ llama.cpp TurboQuant' not in frame():raise RuntimeError('TurboQuant not current\n'+frame())
 (ev/'B16-turboquant-picker.txt').write_text(frame()+'\n')
 os.write(fd,b'\x1b');pump(lambda:False,.15)
 picker();click('LFM2.5 1.2B (MLX)');loaded()
 (ev/'B16-MLX-model.txt').write_text(frame()+'\n')
 picker();click('Inference engine');wait('✓ MLX')
 if '✓ llama.cpp TurboQuant' in frame():raise RuntimeError('Old engine remains marked')
 (ev/'B16-MLX-picker.txt').write_text(frame()+'\n')
 import urllib.request
 record=json.loads((pathlib.Path(folder)/'atc/run/daemon.json').read_text())
 token=(pathlib.Path(folder)/'atc/run/admin-token').read_text().strip()
 req=urllib.request.Request(record['admin_url']+'/api/workspace',headers={'Authorization':'Bearer '+token,'x-atc-admin':'1'})
 snapshot=json.load(urllib.request.urlopen(req))
 services=snapshot['services']
 if not any(row['provider']=='mlx' and row['state']=='ready' for row in services):raise RuntimeError('No ready MLX session')
 (ev/'B16-live-services.json').write_text(json.dumps(services,indent=2)+'\n')
 choice=json.loads((pathlib.Path(folder)/'atc/engine-choice.json').read_text())
 if choice['id']!='mlx':raise RuntimeError('MLX preference not persisted')
 (ev/'B16-engine-choice.json').write_text(json.dumps(choice,indent=2)+'\n')
 os.write(fd,b'\x1b');pump(lambda:False,.4);os.write(fd,b'\x11')
 end=time.monotonic()+12;done=0
 while time.monotonic()<end and not done:
  done,status=os.waitpid(pid,os.WNOHANG)
  if not done:pump(lambda:False,.2)
 (ev/'B16-quit.txt').write_text(frame()+'\n')
 if not done:raise RuntimeError('Quit did not exit\n'+frame())
 print(json.dumps({'switch':'TurboQuant → MLX','current_marker':'MLX','persisted':choice['id'],'exit':os.waitstatus_to_exitcode(status)}))
finally:
 try:os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
 except (OSError,ChildProcessError):pass
