import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { WorkspaceOperation } from '@contract'
import { OperationForm } from './OperationForm'

it('groups object parameters without nesting labels and connects JSON errors to their editor', () => {
  const operation: WorkspaceOperation = {
    name: 'test.configure',
    title: 'Configure',
    description: 'Configure request options.',
    effect: 'configure',
    group: 'test',
    mutates: true,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['request'],
      properties: {
        request: {
          type: 'object',
          description: 'Options for this request.',
          additionalProperties: true,
          properties: {
            model: { type: 'string' },
            options: { type: 'object', properties: { enabled: { type: 'boolean' } } },
          },
        },
      },
    },
  }
  render(<OperationForm operation={operation} execute={vi.fn()} />)
  const group = screen.getByRole('group', { name: 'request *' })
  expect(group).toHaveAccessibleDescription('Options for this request.')
  expect(group.querySelector('label label')).toBeNull()
  expect(within(group).getByRole('textbox', { name: 'model' })).toBeInTheDocument()
  expect(within(group).getByRole('group', { name: 'options' })).toBeInTheDocument()
  fireEvent.click(screen.getByText('Additional fields (JSON)'))
  const extra = screen.getByRole('textbox', { name: 'request additional fields' })
  fireEvent.change(extra, { target: { value: '{' } })
  expect(extra).toHaveAccessibleDescription('Enter a JSON object.')
  expect(extra).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(extra, { target: { value: '{}' } })
  expect(extra).not.toHaveAttribute('aria-invalid', 'true')
})
