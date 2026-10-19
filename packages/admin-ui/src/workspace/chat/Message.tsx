import { JsonResult } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { MarkdownMessage } from './MarkdownMessage'
export function Message({ message, markdown = false }: { message: RecordValue; markdown?: boolean }) {
  const content = message.content
  return (
    <>
      {typeof content === 'string' ? (
        markdown ? (
          <MarkdownMessage content={content} />
        ) : (
          <div className="message-text">{content}</div>
        )
      ) : (
        rows(content).map((part, i) =>
          part.type === 'text' ? (
            <div className="message-text" key={i}>
              {text(part.text, '')}
            </div>
          ) : part.type === 'image_url' &&
            /^data:image\/(png|jpeg|webp|gif);base64,/.test(text(record(part.image_url).url)) ? (
            <img key={i} className="chat-image" src={text(record(part.image_url).url)} alt="Attached image" />
          ) : (
            <JsonResult key={i} value={part} />
          )
        )
      )}
      {message.reasoning_content ? (
        <details>
          <summary>Reasoning</summary>
          <div className="message-text">{text(message.reasoning_content)}</div>
        </details>
      ) : null}
      {message.tool_calls ? (
        <details>
          <summary>Tool calls</summary>
          <JsonResult value={message.tool_calls} />
        </details>
      ) : null}
    </>
  )
}
