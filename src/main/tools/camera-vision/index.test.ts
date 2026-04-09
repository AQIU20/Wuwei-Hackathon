// @ts-nocheck
import { afterEach, describe, expect, it } from 'bun:test'
import { fauxAssistantMessage, registerFauxProvider } from '@mariozechner/pi-ai'
import { ConfigService } from '../../providers/config-service'
import { ProviderRegistry } from '../../providers/registry'
import { createCameraVisionTools } from './index'

const registrations: Array<{ unregister: () => void }> = []

afterEach(() => {
  while (registrations.length > 0) {
    registrations.pop()?.unregister()
  }
})

describe('createCameraVisionTools', () => {
  it('loads recent camera image events and sends them to the active vision model', async () => {
    const registration = registerFauxProvider({
      api: 'faux-camera-test',
      models: [{ id: 'vision-test', input: ['text', 'image'] }],
      provider: 'faux-camera',
    })
    registrations.push(registration)

    let capturedContent = null
    registration.setResponses([
      (context) => {
        capturedContent = context.messages[0]?.content
        return fauxAssistantMessage(
          JSON.stringify({
            answer: 'The camera saw 2 people in the recent images.',
            confidence: 0.93,
            evidence: [
              {
                msg_id: 'camera-2',
                node_id: 'cam_front',
                recorded_at: '2026-04-09T10:01:00.000Z',
                summary: 'Two people standing near the doorway.',
              },
            ],
            reasoning: 'The second image clearly contains two people.',
          }),
        )
      },
    ])

    const configService = new ConfigService('/tmp/camera-vision-tool-test')
    configService.init()
    configService.saveProvider({
      api: 'faux-camera-test',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:0',
      displayName: 'Faux Camera',
      id: 'faux-camera',
      isBuiltIn: false,
      models: [
        {
          contextWindow: 128000,
          id: 'vision-test',
          maxTokens: 16384,
          name: 'Vision Test',
          reasoning: false,
          toolUse: false,
        },
      ],
      provider: 'faux-camera',
    })
    configService.setActiveModel('faux-camera/vision-test')

    const tool = createCameraVisionTools({
      configService,
      cwd: process.cwd(),
      getWebSearchConfig: () => ({ tavilyApiKey: '' }),
      hardware: {} as never,
      hardwareEvents: {
        isEnabled: () => true,
        queryEvents: async () => ({
          count: 2,
          samples: [
            {
              capability: 'camera',
              confidence: 0.8,
              eventTsMs: 1,
              msgId: 'camera-1',
              nodeId: 'cam_front',
              nodeType: 'cam',
              payload: {
                image_base64: Buffer.from('fake-jpeg-1').toString('base64'),
                mime_type: 'image/jpeg',
                snapshot_id: 'snap-1',
              },
              recordedAt: '2026-04-09T10:00:00.000Z',
              scope: 'vision',
              signalName: 'snapshot',
              status: null,
              subject: 'snapshot',
              success: null,
              topic: 'direct/vision/cam_front/snapshot',
              type: 'camera_snapshot_final',
            },
            {
              capability: 'camera',
              confidence: 0.9,
              eventTsMs: 2,
              msgId: 'camera-2',
              nodeId: 'cam_front',
              nodeType: 'cam',
              payload: {
                analysis_text: 'doorway scene',
                image_base64: Buffer.from('fake-jpeg-2').toString('base64'),
                mime_type: 'image/jpeg',
                snapshot_id: 'snap-2',
              },
              recordedAt: '2026-04-09T10:01:00.000Z',
              scope: 'vision',
              signalName: 'snapshot',
              status: null,
              subject: 'snapshot',
              success: null,
              topic: 'direct/vision/cam_front/snapshot',
              type: 'camera_snapshot_final',
            },
          ],
        }),
      },
      history: null,
      mqttBridge: null,
      registry: new ProviderRegistry(configService),
    })[0]

    const result = await tool.execute('tool-1', {
      lookback_minutes: 10,
      max_images: 4,
      question: 'How many people appeared in the last 10 minutes?',
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('The camera saw 2 people in the recent images.')
    expect(result.content[0]?.text).toContain('Images analyzed: 2')
    expect(capturedContent).toHaveLength(3)
    expect(capturedContent[0]?.type).toBe('text')
    expect(capturedContent[1]?.type).toBe('image')
    expect(capturedContent[2]?.type).toBe('image')
  })

  it('samples at most 10 images across the requested time window', async () => {
    const registration = registerFauxProvider({
      api: 'faux-camera-sampling-test',
      models: [{ id: 'vision-test', input: ['text', 'image'] }],
      provider: 'faux-camera-sampling',
    })
    registrations.push(registration)

    let capturedContent = null
    registration.setResponses([
      (context) => {
        capturedContent = context.messages[0]?.content
        return fauxAssistantMessage(
          JSON.stringify({
            answer: 'Sampled 10 images across the full window.',
            confidence: 0.88,
          }),
        )
      },
    ])

    const configService = new ConfigService('/tmp/camera-vision-tool-sampling-test')
    configService.init()
    configService.saveProvider({
      api: 'faux-camera-sampling-test',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:0',
      displayName: 'Faux Camera Sampling',
      id: 'faux-camera-sampling',
      isBuiltIn: false,
      models: [
        {
          contextWindow: 128000,
          id: 'vision-test',
          maxTokens: 16384,
          name: 'Vision Test',
          reasoning: false,
          toolUse: false,
        },
      ],
      provider: 'faux-camera-sampling',
    })
    configService.setActiveModel('faux-camera-sampling/vision-test')

    const samples = Array.from({ length: 25 }, (_, index) => ({
      capability: 'camera',
      confidence: 0.5 + index / 100,
      eventTsMs: index + 1,
      msgId: `camera-${index + 1}`,
      nodeId: 'cam_front',
      nodeType: 'cam',
      payload: {
        image_base64: Buffer.from(`fake-jpeg-${index + 1}`).toString('base64'),
        mime_type: 'image/jpeg',
        snapshot_id: `snap-${index + 1}`,
      },
      recordedAt: `2026-04-09T10:${String(index).padStart(2, '0')}:00.000Z`,
      scope: 'vision',
      signalName: 'snapshot',
      status: null,
      subject: 'snapshot',
      success: null,
      topic: 'direct/vision/cam_front/snapshot',
      type: 'camera_snapshot_final',
    }))

    const tool = createCameraVisionTools({
      configService,
      cwd: process.cwd(),
      getWebSearchConfig: () => ({ tavilyApiKey: '' }),
      hardware: {} as never,
      hardwareEvents: {
        isEnabled: () => true,
        queryEvents: async () => ({
          count: samples.length,
          samples,
        }),
      },
      history: null,
      mqttBridge: null,
      registry: new ProviderRegistry(configService),
    })[0]

    const result = await tool.execute('tool-2', {
      lookback_minutes: 60,
      max_images: 16,
      question: '这一小时里发生了什么？',
    })

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Images analyzed: 10')
    expect(result.content[0]?.text).toContain('Images available in window: 25')
    expect(capturedContent).toHaveLength(11)
    expect(capturedContent.filter((item) => item.type === 'image')).toHaveLength(10)

    const metadata = JSON.parse(capturedContent[0]?.text ?? '{}')
    expect(metadata.image_count).toBe(10)
    expect(metadata.sampled_from_image_count).toBe(25)
    expect(metadata.images[0]?.msg_id).toBe('camera-1')
    expect(metadata.images[9]?.msg_id).toBe('camera-25')
  })
})
