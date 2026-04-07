import { useCallback, useEffect, useRef, useState } from 'react'

import type { Block, ChatConfig, Message, MessageStatus, QueuedPromptDraft } from '@/types/chat'

interface QueuedPrompt extends QueuedPromptDraft {
  assistantId: string
}

interface UseAgentChatResult {
  config: ChatConfig | null
  messages: Message[]
  isStreaming: boolean
  queuedCount: number
  queuedPrompts: QueuedPromptDraft[]
  currentSessionPath: string | null
  composerResetToken: number
  handleAbort: () => Promise<void>
  handleSubmitPrompt: (text: string) => Promise<boolean>
  handleEditQueuedPrompt: (promptId: string, currentDraft: string) => string | null
  handleRemoveQueuedPrompt: (promptId: string) => void
  handleNewSession: () => Promise<void>
  handleResumeSession: (sessionPath: string) => Promise<void>
  handleDeleteSession: (sessionPath: string) => Promise<void>
}

export function useAgentChat(): UseAgentChatResult {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPromptDraft[]>([])
  const [config, setConfig] = useState<ChatConfig | null>(null)
  const [currentSessionPath, setCurrentSessionPath] = useState<string | null>(null)
  const [composerResetToken, setComposerResetToken] = useState(0)

  const isStreamingRef = useRef(false)
  const activeAssistantIdRef = useRef<string | null>(null)
  const promptQueueRef = useRef<QueuedPrompt[]>([])
  const processNextPromptRef = useRef<() => void>(() => {})

  // --- rAF delta buffering ---
  const pendingTextRef = useRef('')
  const pendingThinkingRef = useRef('')
  const rafRef = useRef<number | null>(null)

  const createMessageId = useCallback(() => `msg-${crypto.randomUUID()}`, [])
  const queuedCount = queuedPrompts.length
  const resetComposer = useCallback(() => {
    setComposerResetToken((value) => value + 1)
  }, [])
  const loadConfig = useCallback(async () => {
    const nextConfig = await window.api.getConfig()
    setConfig(nextConfig)
  }, [])

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    void loadConfig()

    const unsubscribe = window.api.onConfigChanged(() => {
      void loadConfig()
    })

    return unsubscribe
  }, [loadConfig])

  const updateAssistantMessage = useCallback(
    (assistantId: string, updater: (message: Message) => Message) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId && message.role === 'assistant' ? updater(message) : message,
        ),
      )
    },
    [],
  )

  /** Apply a block-level updater to the current assistant message */
  const updateCurrentAssistantBlocks = useCallback(
    (updater: (blocks: Block[]) => Block[]) => {
      const assistantId = activeAssistantIdRef.current
      if (!assistantId) return

      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        blocks: updater(message.blocks ?? []),
      }))
    },
    [updateAssistantMessage],
  )

  const setAssistantStatus = useCallback((assistantId: string, status: MessageStatus) => {
    setMessages((prev) => {
      let changed = false
      const next = prev.map((message) => {
        if (
          message.id !== assistantId ||
          message.role !== 'assistant' ||
          message.status === status
        ) {
          return message
        }
        changed = true
        return { ...message, status }
      })
      return changed ? next : prev
    })
  }, [])

  const enqueuePrompt = useCallback((prompt: QueuedPrompt) => {
    const nextQueue = [...promptQueueRef.current, prompt]
    promptQueueRef.current = nextQueue
    setQueuedPrompts(nextQueue.map(({ id, text }) => ({ id, text })))
  }, [])

  const dequeuePrompt = useCallback((): QueuedPrompt | null => {
    const [nextPrompt, ...rest] = promptQueueRef.current
    promptQueueRef.current = rest
    setQueuedPrompts(rest.map(({ id, text }) => ({ id, text })))
    return nextPrompt ?? null
  }, [])

  const clearQueuedPrompts = useCallback(() => {
    promptQueueRef.current = []
    setQueuedPrompts([])
    activeAssistantIdRef.current = null
    isStreamingRef.current = false
  }, [])

  /** Flush any buffered text/thinking deltas into state (one setState call) */
  const flushPendingDeltas = useCallback(() => {
    rafRef.current = null
    const text = pendingTextRef.current
    const thinking = pendingThinkingRef.current
    pendingTextRef.current = ''
    pendingThinkingRef.current = ''

    if (!text && !thinking) return

    updateCurrentAssistantBlocks((blocks) => {
      let result = blocks

      if (thinking) {
        const last = result[result.length - 1]
        if (last?.type === 'thinking') {
          result = [...result.slice(0, -1), { ...last, content: last.content + thinking }]
        } else {
          result = [...result, { type: 'thinking', content: thinking }]
        }
      }

      if (text) {
        const last = result[result.length - 1]
        if (last?.type === 'text') {
          result = [...result.slice(0, -1), { ...last, content: last.content + text }]
        } else {
          result = [...result, { type: 'text', content: text }]
        }
      }

      return result
    })
  }, [updateCurrentAssistantBlocks])

  /** Schedule a rAF flush (no-op if one is already scheduled) */
  const scheduleFlush = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPendingDeltas)
    }
  }, [flushPendingDeltas])

  /** Force-flush pending deltas synchronously (used before tool events to preserve order) */
  const forceFlush = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // Flush inline
    const text = pendingTextRef.current
    const thinking = pendingThinkingRef.current
    if (text || thinking) {
      pendingTextRef.current = ''
      pendingThinkingRef.current = ''
      updateCurrentAssistantBlocks((blocks) => {
        let result = blocks
        if (thinking) {
          const last = result[result.length - 1]
          if (last?.type === 'thinking') {
            result = [...result.slice(0, -1), { ...last, content: last.content + thinking }]
          } else {
            result = [...result, { type: 'thinking', content: thinking }]
          }
        }
        if (text) {
          const last = result[result.length - 1]
          if (last?.type === 'text') {
            result = [...result.slice(0, -1), { ...last, content: last.content + text }]
          } else {
            result = [...result, { type: 'text', content: text }]
          }
        }
        return result
      })
    }
  }, [updateCurrentAssistantBlocks])

  const cancelPendingRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingTextRef.current = ''
    pendingThinkingRef.current = ''
  }, [])

  const startPrompt = useCallback(
    (prompt: QueuedPrompt) => {
      activeAssistantIdRef.current = prompt.assistantId
      isStreamingRef.current = true
      setIsStreaming(true)
      setMessages((prev) => [
        ...prev,
        { id: createMessageId(), role: 'user', content: prompt.text, status: 'done' },
        { id: prompt.assistantId, role: 'assistant', blocks: [], status: 'streaming' },
      ])

      void window.api.prompt(prompt.text).catch((error) => {
        updateAssistantMessage(prompt.assistantId, (message) => ({
          ...message,
          blocks: [
            ...(message.blocks ?? []),
            { type: 'text', content: `\nIPC Error: ${String(error)}` },
          ],
          status: 'done',
        }))
        activeAssistantIdRef.current = null
        isStreamingRef.current = false
        setIsStreaming(false)
        processNextPromptRef.current()
      })
    },
    [createMessageId, updateAssistantMessage],
  )

  const processNextPrompt = useCallback(() => {
    if (isStreamingRef.current) return
    const nextPrompt = dequeuePrompt()
    if (!nextPrompt) return
    startPrompt(nextPrompt)
  }, [dequeuePrompt, startPrompt])

  useEffect(() => {
    processNextPromptRef.current = processNextPrompt
  }, [processNextPrompt])

  useEffect(() => {
    const cleanups = [
      window.api.onTextDelta((delta) => {
        pendingTextRef.current += delta
        scheduleFlush()
      }),

      window.api.onThinkingDelta((delta) => {
        pendingThinkingRef.current += delta
        scheduleFlush()
      }),

      window.api.onToolStart((data) => {
        forceFlush()
        updateCurrentAssistantBlocks((blocks) => [
          ...blocks,
          { type: 'tool', ...data, status: 'running' as const },
        ])
      }),

      window.api.onToolEnd((data) => {
        updateCurrentAssistantBlocks((blocks) =>
          blocks.map((block) =>
            block.type === 'tool' && block.id === data.id
              ? {
                  ...block,
                  result: data.result,
                  isError: data.isError,
                  status: 'done' as const,
                }
              : block,
          ),
        )
      }),

      window.api.onComplete(() => {
        forceFlush()
        const assistantId = activeAssistantIdRef.current
        if (assistantId) {
          setAssistantStatus(assistantId, 'done')
        }
        activeAssistantIdRef.current = null
        isStreamingRef.current = false
        setIsStreaming(false)
        processNextPrompt()
      }),

      window.api.onError((data) => {
        forceFlush()
        updateCurrentAssistantBlocks((blocks) => [
          ...blocks,
          { type: 'text', content: `\nError: ${data.message}` },
        ])
      }),

      window.api.onSessionReset(() => {
        cancelPendingRaf()
        clearQueuedPrompts()
        setMessages([])
        setIsStreaming(false)
        resetComposer()
      }),
    ]

    return () => {
      for (const cleanup of cleanups) cleanup()
      cancelPendingRaf()
    }
  }, [
    scheduleFlush,
    forceFlush,
    cancelPendingRaf,
    clearQueuedPrompts,
    processNextPrompt,
    resetComposer,
    setAssistantStatus,
    updateCurrentAssistantBlocks,
  ])

  const handleSubmitPrompt = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (!text) {
        return false
      }

      const prompt: QueuedPrompt = {
        id: createMessageId(),
        assistantId: createMessageId(),
        text,
      }

      if (isStreamingRef.current || promptQueueRef.current.length > 0) {
        enqueuePrompt(prompt)
        return true
      }

      startPrompt(prompt)
      return true
    },
    [createMessageId, enqueuePrompt, startPrompt],
  )

  const handleEditQueuedPrompt = useCallback(
    (promptId: string, currentDraft: string) => {
      const promptIndex = promptQueueRef.current.findIndex((prompt) => prompt.id === promptId)
      if (promptIndex < 0) return null

      const queuedPrompt = promptQueueRef.current[promptIndex]
      const rest = promptQueueRef.current.filter((prompt) => prompt.id !== promptId)
      const trimmedDraft = currentDraft.trim()
      if (trimmedDraft) {
        rest.splice(promptIndex, 0, {
          id: createMessageId(),
          assistantId: createMessageId(),
          text: trimmedDraft,
        })
      }

      promptQueueRef.current = rest
      setQueuedPrompts(rest.map(({ id, text }) => ({ id, text })))
      return queuedPrompt.text
    },
    [createMessageId],
  )

  const handleRemoveQueuedPrompt = useCallback((promptId: string) => {
    const rest = promptQueueRef.current.filter((prompt) => prompt.id !== promptId)
    if (rest.length === promptQueueRef.current.length) return
    promptQueueRef.current = rest
    setQueuedPrompts(rest.map(({ id, text }) => ({ id, text })))
  }, [])

  const handleAbort = useCallback(async () => {
    await window.api.abort()
  }, [])

  const handleNewSession = useCallback(async () => {
    clearQueuedPrompts()
    await window.api.newSession()
    setCurrentSessionPath(null)
    resetComposer()
  }, [clearQueuedPrompts, resetComposer])

  const handleResumeSession = useCallback(
    async (sessionPath: string) => {
      if (isStreaming || promptQueueRef.current.length > 0) return
      try {
        const restored = await window.api.resumeSession(sessionPath)
        cancelPendingRaf()
        clearQueuedPrompts()
        setMessages(
          (restored as Array<Omit<Message, 'id'> | Message>).map((message) => ({
            ...message,
            id: 'id' in message && typeof message.id === 'string' ? message.id : createMessageId(),
            status: 'done',
          })),
        )
        setIsStreaming(false)
        setCurrentSessionPath(sessionPath)
        resetComposer()
      } catch (error) {
        console.error('Failed to resume session:', error)
      }
    },
    [isStreaming, cancelPendingRaf, clearQueuedPrompts, createMessageId, resetComposer],
  )

  const handleDeleteSession = useCallback(
    async (sessionPath: string) => {
      try {
        await window.api.deleteSession(sessionPath)
        // If we deleted the current session, the main process sends session-reset
        // which clears messages via the onSessionReset listener
        if (sessionPath === currentSessionPath) {
          setCurrentSessionPath(null)
        }
      } catch (error) {
        console.error('Failed to delete session:', error)
      }
    },
    [currentSessionPath],
  )

  // Track current session path after first prompt
  const prevMessagesLen = useRef(0)
  useEffect(() => {
    if (messages.length > 0 && prevMessagesLen.current === 0 && !currentSessionPath) {
      void window.api.getCurrentSession().then(setCurrentSessionPath)
    }
    prevMessagesLen.current = messages.length
  }, [messages.length, currentSessionPath])

  return {
    config,
    messages,
    isStreaming,
    queuedCount,
    queuedPrompts,
    currentSessionPath,
    composerResetToken,
    handleAbort,
    handleSubmitPrompt,
    handleEditQueuedPrompt,
    handleRemoveQueuedPrompt,
    handleNewSession,
    handleResumeSession,
    handleDeleteSession,
  }
}
