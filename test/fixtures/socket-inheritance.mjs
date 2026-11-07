// Runs unchanged as a Node/Bun script or a compiled executable. No model or user data is needed.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, get } from 'node:http'

if (process.argv.includes('--socket-child')) {
  process.stdout.write('ready\n')
  setInterval(() => {}, 1000)
} else {
  await checkListenerRestart()
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
}

async function close(server) {
  if (!server.listening) return
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close((error) =>
    error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()
  ))
}

function answer(port) {
  return new Promise((resolve, reject) => {
    get(`http://127.0.0.1:${port}/`, { agent: false }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (part) => (body += part))
      response.on('end', () => resolve(body))
      response.on('error', reject)
    }).on('error', reject)
  })
}

async function checkListenerRestart() {
  const first = createServer((_, response) => response.end('before'))
  const second = createServer((_, response) => response.end('after'))
  let child
  const deadline = setTimeout(() => {
    child?.kill()
    console.error('Socket inheritance probe timed out')
    process.exit(1)
  }, 30000)
  try {
    await listen(first, 0)
    const { port } = first.address()
    assert.equal(await answer(port), 'before')
    // Mirrors an engine started after the public API; the child itself opens no sockets.
    child = spawn(process.execPath, [process.argv[1], '--socket-child'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    await Promise.race([
      once(child.stdout, 'data').then(([data]) => assert.equal(data.toString().trim(), 'ready')),
      once(child, 'error').then(([error]) => { throw error }),
      once(child, 'exit').then(() => { throw new Error('Child exited before readiness') }),
    ])
    await close(first)
    assert.equal(child.exitCode, null, 'The engine process must survive API stop')
    // A child inheriting the listener leaves this exact port occupied after close() completes.
    await listen(second, port)
    assert.equal(await answer(port), 'after')
    assert.equal(child.exitCode, null, 'Restart must not unload the engine')
    process.stdout.write('API restarted on the same port with the original child alive\n')
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    await close(first)
    await close(second)
    clearTimeout(deadline)
  }
}
