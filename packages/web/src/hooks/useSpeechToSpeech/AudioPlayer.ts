// /home/ec2-user/generative-ai-use-cases-jp/packages/web/src/hooks/useSpeechToSpeech/AudioPlayer.ts
import { ObjectExt } from './ObjectsExt.js'; // 注: ObjectExtの型定義も必要になる可能性があります

// Worklet URLは文字列として扱われます
const AudioPlayerWorkletUrl: string = new URL(
  './AudioPlayerProcessor.worklet.js',
  import.meta.url
).toString();

// リスナー関数の型を定義します
type AudioPlayedListener = (samples: Float32Array) => void;

// AudioPlayerクラスの定義
export class AudioPlayer {
  // privateプロパティとして型を宣言します
  private onAudioPlayedListeners: AudioPlayedListener[];
  private initialized: boolean;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private recorderNode: ScriptProcessorNode | null = null;

  constructor() {
    this.onAudioPlayedListeners = [];
    this.initialized = false;
  }

  /**
   * イベントリスナーを追加します。
   * @param event イベント名 ('onAudioPlayed' のみサポート)
   * @param callback イベント発生時に呼び出されるコールバック関数
   */
  public addEventListener(event: 'onAudioPlayed', callback: AudioPlayedListener): void {
    switch (event) {
      case 'onAudioPlayed':
        this.onAudioPlayedListeners.push(callback);
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
   * オーディオコンテキストとノードを初期化し、再生を開始します。
   */
  public async start(): Promise<void> {
    // AudioContextと各種ノードを初期化します
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;

    // Audio Workletのモジュールを追加
    await this.audioContext.audioWorklet.addModule(AudioPlayerWorkletUrl);
    
    // AudioWorkletNodeを作成
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      'audio-player-processor'
    );
    
    // ノードの接続
    this.workletNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    // ScriptProcessorNodeを作成（非推奨ですが、元のコードに準拠）
    this.recorderNode = this.audioContext.createScriptProcessor(512, 1, 1);
    
    // onaudioprocessの型定義
    this.recorderNode.onaudioprocess = (event: AudioProcessingEvent) => {
      // Pass the input along as-is
      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);
      outputData.set(inputData);
      
      // Notify listeners that the audio was played
      const samples = new Float32Array(outputData.length);
      samples.set(outputData);
      this.onAudioPlayedListeners.map((listener) => listener(samples));
    };

    this.#maybeOverrideInitialBufferLength();
    this.initialized = true;
  }

  /**
   * 再生中の音声を中断します。
   */
  public bargeIn(): void {
    this.workletNode?.port.postMessage({
      type: 'barge-in',
    });
  }

  /**
   * すべてのオーディオノードとコンテキストを停止し、リソースを解放します。
   */
  public stop(): void {
    if (ObjectExt.exists(this.audioContext)) {
      this.audioContext?.close();
    }

    // 存在チェックを行い、接続を解除します
    this.analyser?.disconnect();
    this.workletNode?.disconnect();
    this.recorderNode?.disconnect();

    this.initialized = false;
    this.audioContext = null;
    this.analyser = null;
    this.workletNode = null;
    this.recorderNode = null;
  }

  /**
   * Workletの初期バッファ長をURLパラメータから読み取って設定します。（privateメソッド）
   */
  #maybeOverrideInitialBufferLength(): void {
    // windowオブジェクトはブラウザ環境で利用可能です
    const params = new URLSearchParams(window.location.search);
    const value = params.get('audioPlayerInitialBufferLength');
    
    if (value === null) {
      return; // No override specified
    }
    
    const bufferLength = parseInt(value, 10);
    
    if (isNaN(bufferLength)) {
      console.error(
        'Invalid audioPlayerInitialBufferLength value:',
        JSON.stringify(value)
      );
      return;
    }

    this.workletNode?.port.postMessage({
      type: 'initial-buffer-length',
      bufferLength: bufferLength,
    });
  }

  /**
   * AudioWorkletに音声サンプルを送信して再生します。
   * @param samples 再生するFloat32Array形式の音声データ
   */
  public playAudio(samples: Float32Array): void {
    if (!this.initialized) {
      console.error(
        'The audio player is not initialized. Call init() before attempting to play audio.'
      );
      return;
    }
    this.workletNode?.port.postMessage({
      type: 'audio',
      audioData: samples,
    });
  }

  /**
   * 現在の音声データを取得し、-1から1に正規化して返します。
   * @returns 正規化された音声データの配列、または null
   */
  public getSamples(): number[] | null {
    if (!this.initialized || !this.analyser) {
      return null;
    }
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    
    // Uint8Array (0-255)を -1から1に正規化します
    return Array.from(dataArray).map((e) => e / 128 - 1);
  }
  
  /**
   * 現在の音量（RMS: 二乗平均平方根）を計算して返します。
   * @returns 音量値 (0から1の間)
   */
  public getVolume(): number {
    if (!this.initialized || !this.analyser) {
      return 0;
    }
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    
    // Uint8Arrayを -1から1に正規化
    let normSamples: number[] = Array.from(dataArray).map((e) => e / 128 - 1);
    let sum: number = 0;
    
    for (let i = 0; i < normSamples.length; i++) {
      sum += normSamples[i] * normSamples[i];
    }
    // RMS (Root Mean Square) を計算
    return Math.sqrt(sum / normSamples.length);
  }
}

