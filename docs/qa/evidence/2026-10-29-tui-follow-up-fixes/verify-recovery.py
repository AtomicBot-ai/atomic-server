import os,sys,json,pty,select,fcntl,termios,struct,signal,re,time,pathlib,urllib.request
sys.path.insert(0,'/private/tmp/atomic-qa-pyte')
import pyte
m=json.loads(pathlib.Path(sys.argv[1]).read_text());base=pathlib.Path(m['base']);folder=pathlib.Path(m['data']);
if not base.name.startswith('atomic-qa-') or folder.parent!=base:raise SystemExit('Use a disposable atomic-qa-* data folder.')
ev=base/'fixed-evidence';ev.mkdir(exist_ok=True)
env=os.environ.copy();env.update(ATC_DATA_FOLDER=str(folder),ATOMIC_CORE_DATA_FOLDER=str(base/'app-data'),ATC_UPDATE_CHECK_ON_START='false',NO_COLOR='1',TERM='xterm-256color')
pid,fd=pty.fork()
if pid==0:os.execve(m['binary'],[m['binary'],'--data-folder',str(folder)],env)
fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0));os.kill(pid,signal.SIGWINCH)
screen=pyte.Screen(120,40);stream=pyte.ByteStream(screen)
out=b'';ansi=re.compile(rb'\x1b\[[0-?]*[ -/]*[@-~]')
def frame():
 return '\n'.join(screen.display)
def pump(check=lambda:False,timeout=.3):
 global out
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if check():return True
  r,_,_=select.select([fd],[],[],.03)
  if r:
   try:data=os.read(fd,262144)
   except OSError:return False
   if not data:return False
   out+=data;stream.feed(data)
 return check()
def wait(label,timeout=8):
 if not pump(lambda:label in frame(),timeout):raise RuntimeError('Not visible: '+label)
def api(op=None,values={}):
 record=json.loads((folder/'atc/run/daemon.json').read_text());token=(folder/'atc/run/admin-token').read_text().strip()
 url=record['admin_url']+('/api/workspace/execute' if op else '/api/workspace')
 req=urllib.request.Request(url,data=json.dumps({'operation':op,'input':values}).encode() if op else None,headers={'Authorization':'Bearer '+token,'x-atc-admin':'1','Content-Type':'application/json'})
 try:return json.load(urllib.request.urlopen(req,timeout=45))
 except urllib.error.HTTPError as e:return {'http':e.code,'body':json.load(e)}
def step(c):
 if 'press' in c:os.write(fd,c['press'].encode());pump(timeout=c.get('settle',.3))
 if 'resize' in c:
  rows,cols=c['resize'];screen.resize(lines=rows,columns=cols);fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0));os.kill(pid,signal.SIGWINCH);pump(timeout=.4)
 if 'wait' in c:wait(c['wait'],c.get('timeout',8))
 if 'click' in c:
  wait(c['click']);pump(timeout=.1);rows=frame().split('\n');matches=[(row.index(c['click']),y) for y,row in enumerate(rows) if c['click'] in row]
  x,y=matches[c.get('match',0)];os.write(fd,('\x1b[<0;%d;%dM'%(x+1,y+1)).encode());pump(timeout=c.get('settle',.3))
 if 'api' in c:return api(c['api'],c.get('input',{}))
 if 'snapshot' in c:return api()
 if 'capture' in c:(ev/(c['capture']+'.txt')).write_text(frame().rstrip()+'\n')
 if c.get('quit'):
  os.write(fd,b'\x11');end=time.monotonic()+6
  while time.monotonic()<end:
   done,status=os.waitpid(pid,os.WNOHANG)
   if done:return {'exit':os.waitstatus_to_exitcode(status)}
   pump(timeout=.1)
  return {'exit':None,'frame':frame()}
 return frame()


try:
 step({'wait':'Agents & tools'});step({'click':'Playground'})
 step({'click':'+ Files'});step({'click':'+ Document'})
 missing='/private/tmp/atomic-qa-missing-document-fixed.txt'
 step({'press':missing});step({'press':'\r','settle':.6});step({'capture':'B18-visible-document-error'})
 assert 'ENOENT' in frame() and missing in frame() and 'Attach document' in frame(),frame()
 step({'press':'\x15'});step({'press':str(base/'notes.txt')});step({'press':'\r','settle':.6});step({'wait':'Files 1'})
 assert 'ENOENT' not in frame(),frame()
 step({'capture':'B18-recovered-document'})
 step({'click':'mlx-community/'})
 for i in range(3):step({'press':'\x1b[B'})
 step({'click':'Connect an endpoint'});step({'press':'\x15'});step({'press':'not-a-url'});step({'press':'\r','settle':.6})
 assert any(error in frame() for error in ['Invalid URL', 'cannot be parsed as a URL']) and 'not-a-url_' in frame(),frame()
 step({'capture':'B18-visible-URL-error'});step({'press':'\x1b'})
 step({'press':'Keep the endpoint-switch draft'})
 step({'api':'models.unload','input':{'provider':'mlx','model_id':'mlx-community/LFM2.5-1.2B-Instruct-4bit'}})
 step({'click':'mlx-community/'});step({'wait':'LFM2.5 1.2B (MLX)'});step({'click':'LFM2.5 1.2B (MLX)'})
 assert 'Loading model' in frame(),frame()
 step({'click':'mlx-community/'})
 for i in range(3):step({'press':'\x1b[B'})
 remote='http://127.0.0.1:9/fixed-'+str(int(time.time()))
 step({'click':'Connect an endpoint'});step({'press':'\x15'});step({'press':remote});step({'press':'\r','settle':.6})
 before=json.loads((folder/'atc/config.json').read_text())['tui']
 assert before.get('endpoint')==remote and before.get('model')=='',before
 assert not any(s['provider']=='mlx' and s['state']=='ready' for s in api()['services']),'Load completed before endpoint save; not a valid race'
 step({'capture':'B17-new-endpoint-during-load'})
 end=time.monotonic()+50
 while time.monotonic()<end:
  services=api()['services']
  if any(s['provider']=='mlx' and s['state']=='ready' for s in services):break
  pump(timeout=.3)
 else:raise RuntimeError('Old MLX load never reached ready')
 pump(timeout=1)
 after=json.loads((folder/'atc/config.json').read_text())['tui']
 assert after.get('endpoint')==remote and after.get('model')=='',after
 assert 'Connection saved.' in frame() and 'Keep the endpoint-switch draft' in frame(),frame()
 assert 'Model loaded.' not in frame() and 'Loading model' not in frame(),frame()
 step({'capture':'B17-new-endpoint-after-old-load'})
 result={'document_error_visible':True,'document_recovery_clears_error':True,'invalid_URL_error_visible':True,'before':before,'after':after,'old_MLX_load_ready':True,'new_endpoint_retained':True,'draft_retained':True,'exit':step({'quit':True})}
 (ev/'B17-B18-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
 assert result['exit']['exit']==0,result
finally:
 (base/'fixed-B17-B18.raw').write_bytes(out)
 try:os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
 except (OSError,ChildProcessError):pass
