import type { ComponentProps, ReactNode } from 'react'
import './styles/directory.css'

export function DirectoryRow({
  title,
  detail,
  leading,
  trailing,
  className = '',
  ...button
}: Omit<ComponentProps<'button'>, 'title' | 'children'> & {
  title: ReactNode
  detail?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button type="button" className={`directory-row ${className}`} {...button}>
      {leading}
      <span className="directory-copy">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {trailing}
    </button>
  )
}
