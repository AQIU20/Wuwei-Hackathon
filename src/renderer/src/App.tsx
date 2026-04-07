import type { ReactElement } from 'react'
import { useState } from 'react'

import { ChatPage } from '@/pages/chat/ChatPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'

export default function App(): ReactElement {
  const [activePage, setActivePage] = useState<'chat' | 'settings'>('chat')

  return (
    <div className="h-full">
      <div className={activePage === 'chat' ? 'h-full' : 'hidden h-full'}>
        <ChatPage onOpenSettings={() => setActivePage('settings')} />
      </div>

      {activePage === 'settings' && (
        <div className="h-full">
          <SettingsPage onBack={() => setActivePage('chat')} />
        </div>
      )}
    </div>
  )
}
