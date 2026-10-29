import os,sys,json,pty,select,fcntl,termios,struct,signal,re,time,pathlib,urllib.request
sys.path.insert(0,'/private/tmp/atomic-qa-pyte')
import pyte
m=json.loads(pathlib.Path(sys.argv[1]).read_text());base=pathlib.Path(m['base']);folder=pathlib.Path(m['data']);
if not base.name.startswith('atomic-qa-') or folder.parent!=base:raise SystemExit('Use a disposable atomic-qa-* data folder.')
ev=base/'evidence';ev.mkdir(exist_ok=True)
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
 step({'wait':'Agents & tools'});step({'click':'Playground'});step({'click':'QA pass06.'});step({'click':'Write a message'});step({'press':'PASS06-DRAFT-RETAIN'})
 summary=api('history.list')[0];chat=api('history.load',{'id':summary['id']})
 job=api('chat.start',{'conversation_id':chat['id'],'expected_revision':chat['revision'],'request':{'model':chat['model'],'messages':chat['messages']+[{'role':'user','content':'Write all integers from 1 to 1000 separated by commas. Keep going until 1000.'}],'max_tokens':2048}})
 os.write(fd,b'\r');wait('already has an active request',8);step({'capture':'active-other-turn-refusal'})
 result={'active_request_refused':True,'draft_retained':'PASS06-DRAFT-RETAIN' in frame()}
 step({'press':'\x0e'});step({'wait':'Write a message'});step({'capture':'active-other-turn-new-chat'})
 result['new_chat_opened']='PASS06-DRAFT-RETAIN' not in frame();result['quit']=step({'quit':True})
 progress=api('chat.progress',{'id':job['id']});end=time.monotonic()+15
 while progress['state'] in ['preparing','generating','stopping'] and time.monotonic()<end:
  time.sleep(.05);progress=api('chat.progress',{'id':job['id']})
 latest=api('history.load',{'id':chat['id']});result['rejected_draft_not_saved']=not any('PASS06-DRAFT-RETAIN' in str(msg.get('content','')) for msg in latest['messages']);result['other_job_state']=progress['state']
 (ev/'active-other-turn-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
finally:
 (base/'active-other-turn.raw').write_bytes(out)
 try:os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
 except (OSError,ChildProcessError):pass
