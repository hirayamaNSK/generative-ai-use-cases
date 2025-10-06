// /packages/web/src/hooks/useSpeechToSpeech/ObjectsExt.ts (または適切なパス)

/**
 * Null/Undefinedチェックや引数の検証を行うユーティリティクラス。
 */
export class ObjectExt {
  /**
   * オブジェクトまたは変数が null または undefined でないかをチェックします。
   * TypeScriptの型ガードとして機能させるために 'obj is NonNullable<T>' を使用します。
   * * @param obj チェックする任意の変数
   * @returns objがnullでもundefinedでもない場合、true
   */
  static exists<T>(obj: T | null | undefined): obj is NonNullable<T> {
    return obj !== undefined && obj !== null;
  }

  /**
   * 条件が false の場合に TypeError をスローします。
   * * @param condition 評価するブール値の条件
   * @param message 条件がfalseの場合にスローされるエラーメッセージ
   */
  static checkArgument(condition: boolean, message?: string): void {
    if (!condition) {
      throw new TypeError(message);
    }
  }

  /**
   * オブジェクトが存在しない（nullまたはundefined）場合にTypeErrorをスローします。
   *
   * ⚠️ 元のコードのロジックが論理的に間違っている可能性があります ⚠️
   * 元のコード: if (ObjectsExt.exists(obj)) { throw TypeError(message); }
   * -> 「オブジェクトが存在するならエラーをスロー」となっています。
   * 通常、`checkExists`は「オブジェクトが存在しないならエラーをスロー」するため、
   * ここでは元のロジックを維持しつつ、クラス名と型を修正します。
   * * @param obj チェックする変数
   * @param message エラーメッセージ
   */
  static checkExists(obj: unknown, message?: string): void {
    // NOTE: ここは元のJSのロジックをそのままTypeScriptに変換しています。
    if (ObjectExt.exists(obj)) { 
      throw new TypeError(message);
    }
  }
}
