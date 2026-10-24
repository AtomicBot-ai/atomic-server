// Lifted from atomic-chat-ui/web-app/src/containers/hub/HubCategorySelect.tsx @ 807b4d9; adapted: existing accessible listbox and supported catalog categories.
import { GitBranch, Image, MessageSquare, Network, Video } from 'lucide-react'
import { DetailPicker } from '../server/DetailPicker'
import './catalog-category.css'

const choices = [
  {
    id: 'text',
    name: 'Text',
    icon: <MessageSquare size={16} aria-hidden="true" />,
    detail: 'Language models for chat',
  },
  {
    id: 'image',
    name: 'Images',
    icon: <Image size={16} aria-hidden="true" />,
    detail: 'Generate images from a prompt',
  },
  {
    id: 'video',
    name: 'Video',
    icon: <Video size={16} aria-hidden="true" />,
    detail: 'Generate short videos',
  },
  {
    id: 'embedding',
    name: 'Embeddings',
    icon: <Network size={16} aria-hidden="true" />,
    detail: 'Turns text, images and audio into vectors.',
  },
  {
    id: 'decision',
    name: 'Decisions',
    icon: <GitBranch size={16} aria-hidden="true" />,
    detail: 'Converts data to probabilities.',
  },
]

export function CatalogCategory({
  value,
  onChange,
  onFocus,
}: {
  value: string
  onChange: (value: string) => void
  onFocus: () => void
}) {
  return (
    <div className="hub-category" onFocus={onFocus}>
      <DetailPicker
        label="Model category"
        value={value}
        choices={choices}
        placeholder="Choose model type"
        onChange={onChange}
      />
    </div>
  )
}
