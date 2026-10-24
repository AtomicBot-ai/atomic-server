import atomicLogo from '../intro/atomic-logo.png'

export function ChatEmpty() {
  return (
    <div className="chat-empty">
      <img src={atomicLogo} alt="" className="chat-empty-mark" />
      <h1>How can I help you today?</h1>
    </div>
  )
}
