/** Native copy confirms success; remote terminals receive OSC 52 without claiming acknowledgement. */
export async function copyWorkspaceText(
  value: string,
  native: ((text: string) => Promise<boolean>) | undefined,
  write: (text: string) => void,
  notify: (message: string) => void
) {
  notify('Copying…')
  try {
    if (await native?.(value)) notify('Copied to clipboard.')
    else {
      write(`\u001b]52;c;${Buffer.from(value).toString('base64')}\u0007`)
      notify('Sent to terminal clipboard.')
    }
  } catch {
    notify('Could not copy. Select the command and copy it manually.')
  }
}
