// /packages/web/src/hooks/useSpeechToSpeech/AudioRecorder.ts

import { ObjectExt } from './ObjectsExt.js'; // 注: ObjectExtの型定義も必要です

// Worklet URLは文字列として扱われます
const AudioRecorderWorkletUrl: string = new URL(
  './AudioRecorderProcessor.worklet.js',
  import.meta.url
).toString();

// カスタムイベントリスナーの型を定義します
type AudioRecordedListener = (samples: Float32Array) => void;
type RecorderError = {
  type: string;
  message: string;
  originalError: unknown;
};
type ErrorListener = (error: RecorderError) => void;
type EventType = 'onAudioRecorded' | 'onError';

export class AudioRecorder {
  // privateプロパティの型宣言と初期化
  private onAudioRecordedListeners: AudioRecordedListener[] = [];
  private onErrorListeners: ErrorListener[] = [];
  private initialized: boolean = false;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  constructor() {
    // プロパティは宣言時に初期化済みですが、元のコードに倣ってここでは何もしません
  }

  /**
   * イベントリスナーを追加します。
   * @param event イベント名 ('onAudioRecorded' または 'onError')
   * @param callback イベント発生時に呼び出されるコールバック関数
   */
  public addEventListener(event: EventType, callback: AudioRecordedListener | ErrorListener): void {
    switch (event) {
      case 'onAudioRecorded':
        // 型アサーションを使用して、コールバックの型を AudioRecordedListener に絞り込みます
        this.onAudioRecordedListeners.push(callback as AudioRecordedListener);
        break;
      case 'onError':
        // 型アサーションを使用して、コールバックの型を ErrorListener に絞り込みます
        this.onErrorListeners.push(callback as ErrorListener);
        break;
      default:
        console.error(
          'Listener registered for event type: ' +
            JSON.stringify(event) +
            ' which is not supported'
        );
    }
  }

  /**
   * レコーダーを初期化し、録音を開始します。
   * @returns 成功した場合は true、失敗した場合は false を返します。
   */
  public async start(): Promise<boolean> {
    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      // Get user media stream
      try {
        // navigator.mediaDevices.getUserMedia は MediaStream を返す Promise です
        this.audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (error) {
        // エラーを RecorderError として処理
        const err = error as Error;
        const errorType = err.name || 'UnknownError';
        const errorMessage = err.message || 'Failed to access microphone';

        this.onErrorListeners.forEach((listener) =>
          listener({
            type: errorType,
            message: errorMessage,
            originalError: error,
          })
        );
        console.error('Microphone access error:', errorType, errorMessage);
        return false;
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.audioStream
      );

      // Add the audio worklet module
      try {
        // audioWorklet.addModule は Promise<void> を返します
        await this.audioContext.audioWorklet.addModule(AudioRecorderWorkletUrl);
      } catch (error) {
        this.onErrorListeners.forEach((listener) =>
          listener({
            type: 'WorkletError',
            message: 'Failed to load audio worklet',
            originalError: error,
          })
        );
        this.cleanup();
        return false;
      }

      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'audio-recorder-processor'
      );

      // Connect the source to the worklet
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      // Listen for audio data from the worklet
      this.workletNode.port.onmessage = (event: MessageEvent) => {
        // event.data の型チェックが必要です
        if (event.data.type === 'audio') {
          const audioData = event.data.audioData as Float32Array; // 適切な型にアサート
          this.onAudioRecordedListeners.forEach((listener) =>
            listener(audioData)
          );
        }
      };
      
      // Start recording
      this.workletNode.port.postMessage({
        type: 'start',
      });

      this.initialized = true;
      return true;
    } catch (error) {
      // Catch any other unexpected errors
      this.onErrorListeners.forEach((listener) =>
        listener({
          type: 'InitializationError',
          message: 'Failed to initialize audio recorder',
          originalError: error,
        })
      );
      this.cleanup();
      return false;
    }
  }

  /**
   * 使用中のすべてのオーディオリソースを解放し、リセットします。
   */
  public cleanup(): void {
    // 存在チェックと切断
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();

    // トラックの停止とリソースの解放
    if (ObjectExt.exists(this.audioStream)) {
      try {
        // audioStream は MediaStream 型なので、getTracks() が利用可能です
        (this.audioStream as MediaStream).getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.error('Error stopping audio tracks:', e);
      }
    }
    if (ObjectExt.exists(this.audioContext)) {
      try {
        // audioContext は AudioContext 型なので、close() が利用可能です
        (this.audioContext as AudioContext).close();
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
    }

    this.initialized = false;
    this.audioContext = null;
    this.audioStream = null;
    this.sourceNode = null;
    this.workletNode = null;
  }

  /**
   * 録音を停止し、リソースを解放します。
   */
  public stop(): void {
    if (this.initialized) {
      // Stop recording
      this.workletNode?.port.postMessage({
        type: 'stop',
      });

      this.cleanup();
    }
  }
}
