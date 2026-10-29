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
chat={'id':str(uuid.uuid4()),'title':'B15 recovery '+uuid.uuid4().hex[:6],'endpoint':'','model':'mlx-community/LFM2.5-1.2B-Instruct-4bit','workingDirectory':'','createdAt':1,'updatedAt':1,'messages':[{'role':'user','content':'B15_BASELINE'},{'role':'assistant','content':'B15_BASELINE_REPLY'}],'interrupted':False}
call('history.save',{'chat':chat})
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
 wait(label);rows=frame().split('\n');x,y=[(row.rfind(label),y) for y,row in enumerate(rows) if label in row][-1]
 before=len(out)
 os.write(fd,('\x1b[<0;%d;%dM'%(x+1,y+1)).encode())
 pump(lambda:len(out)>before,2)
run=pathlib.Path(m['base'])/('repro-'+uuid.uuid4().hex[:6]);run.mkdir()
result={}
try:
 wait('Agents & tools');click('Playground');wait(chat['title'][:19]);click(chat['title'][:19]);wait('B15_BASELINE_REPLY');click('Write a message')
 os.write(fd,b'B15_UNSENT_DRAFT');wait('B15_UNSENT_DRAFT')
 newer=call('history.load',{'id':chat['id']});newer['messages'] += [{'role':'user','content':'B15_EXTERNAL_NEWER'},{'role':'assistant','content':'B15_EXTERNAL_REPLY'}]
 canonical=call('history.save',{'chat':newer})['chat']
 os.write(fd,b'\r');wait('This conversation changed in another client')
 (run/'01-conflict.txt').write_text(frame().rstrip()+'\n')
 click(chat['title'][:19]);pump(lambda:False,1)
 (run/'02-reopen.txt').write_text(frame().rstrip()+'\n')
 result['reopen_shows_newer']= 'B15_EXTERNAL_REPLY' in frame()
 os.write(fd,b'\x0e');pump(lambda:False,1)
 (run/'03-new-chat.txt').write_text(frame().rstrip()+'\n')
 result['new_chat_opened']= 'B15_BASELINE_REPLY' not in frame()
 os.write(fd,b'\x11');pump(lambda:False,1)
 (run/'04-quit.txt').write_text(frame().rstrip()+'\n')
 done,status=os.waitpid(pid,os.WNOHANG);result['quit_exited']=bool(done)
 latest=call('history.load',{'id':chat['id']});result['durable_history_unchanged']=latest==canonical;result['draft_visible']='B15_UNSENT_DRAFT' in frame();result['id']=chat['id'];result['evidence']=str(run)
 (run/'durable.json').write_text(json.dumps(latest,indent=2)+'\n');(run/'result.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
 sys.exit(0 if result['reopen_shows_newer'] and result['new_chat_opened'] and result['quit_exited'] else 1)
finally:
 try:
  os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
 except (OSError,ChildProcessError):pass
