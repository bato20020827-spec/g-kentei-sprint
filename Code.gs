/**
 * Agy_Laboratory 自律ハック便
 * 【試作】GAS×Notion: スマホ休憩5分で回す「G検定2026直前スプリント・一問一答クイズWebアプリ」
 * 
 * Target DB: DB_Study_G検定 (8c885470-c9dd-8280-872e-0166cb8405db)
 */

const NOTION_DATABASE_ID = "8c885470-c9dd-8280-872e-0166cb8405db";

/**
 * Web App エントリーポイント
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('G検定 直前スプリント | Agy_Laboratory')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 指定分野（または全分野）から指定問題数をランダム抽出
 * @param {string} category 'すべて' または '人工知能とは', '機械学習', 'ディープラーニング', '生成AI', '法律・倫理・社会実装'
 * @param {number} count 抽出数（既定: 5問）
 */
function getQuestions(category, count) {
  count = count || 5;
  const allQuestions = getQuestionBank();
  
  let pool = allQuestions;
  if (category && category !== 'すべて') {
    pool = allQuestions.filter(q => q.category === category);
  }
  
  // Fisher-Yates シャッフル
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, count);
}

/**
 * 回答結果をNotion「DB_Study_G検定」へ自動記録
 * @param {Object} resultData 回答セッションのサマリー
 */
function recordToNotion(resultData) {
  // スクリプトプロパティから Notion API キーを取得（未設定時はユーザー側で設定可能）
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('NOTION_API_KEY');
  
  if (!apiKey) {
    return {
      status: "warning",
      message: "GASのスクリプトプロパティに 'NOTION_API_KEY' が未設定です。手動でNotionに記録するか、APIキーを設定してください。"
    };
  }

  const databaseId = NOTION_DATABASE_ID.replace(/-/g, '');
  const nowIso = new Date().toISOString();
  const todayStr = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");

  const titleText = `[G検定演習] ${resultData.category} ${resultData.score}/${resultData.total}問正解 (${resultData.percentage}%)`;
  const isNeedReview = resultData.percentage < 100;

  // 本文ブロックの構築
  const childrenBlocks = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "📝 演習結果サマリー" } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: `実施日時: ${Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm")}\n` } },
          { type: "text", text: { content: `分野: ${resultData.category}\n` } },
          { type: "text", text: { content: `スコア: ${resultData.score} / ${resultData.total} (${resultData.percentage}%)\n` } },
          { type: "text", text: { content: `判定: ${resultData.percentage >= 80 ? "🎉 合格圏内！" : "⚠️ 要復習ポイントあり"}` } }
        ]
      }
    },
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: "🔍 出題問題と解答・解説" } }]
      }
    }
  ];

  // 各問題の詳細
  if (resultData.details && Array.isArray(resultData.details)) {
    resultData.details.forEach((item, index) => {
      const isCorrect = item.isCorrect;
      const mark = isCorrect ? "⭕ 正解" : "❌ 不正解";
      childrenBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: `第${index + 1}問 [${mark}]: ${item.question}` } }]
        }
      });
      childrenBlocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: `あなたの回答: ${item.userAnswer}\n`, annotations: { color: isCorrect ? "default" : "red" } } },
            { type: "text", text: { content: `正解: ${item.correctAnswer}\n`, annotations: { bold: true } } },
            { type: "text", text: { content: `解説: ${item.explanation}\n`, annotations: { italic: true } } }
          ]
        }
      });
    });
  }

  const payload = {
    parent: { database_id: databaseId },
    properties: {
      "名前": {
        title: [{ text: { content: titleText } }]
      },
      "日付": {
        date: { start: todayStr }
      },
      "教材・ソース": {
        rich_text: [{ text: { content: "G検定直前スプリントWebアプリ" } }]
      },
      "学習種別": {
        select: { name: "問題演習" }
      },
      "分野": {
        select: { name: resultData.category === "すべて" ? "ディープラーニング" : resultData.category }
      },
      "AI処理状態": {
        status: { name: isNeedReview ? "復習" : "未処理" }
      }
    },
    children: childrenBlocks
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Notion-Version": "2022-06-28"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch("https://api.notion.com/v1/pages", options);
  const respCode = response.getResponseCode();
  if (respCode >= 200 && respCode < 300) {
    return { status: "success", message: "Notion DB_Study_G検定 に学習記録を正常送信しました！" };
  } else {
    return { status: "error", message: `Notion送信エラー (HTTP ${respCode}): ` + response.getContentText() };
  }
}

/**
 * 2026年シラバス対応 G検定 厳選一問一答問題バンク（全25問）
 */
function getQuestionBank() {
  return [
    // === 1. 人工知能とは ===
    {
      id: 1,
      category: "人工知能とは",
      question: "AIが現実世界の無限の事象の中から『今自分に関係のある事柄だけを選別することの難しさ』を指摘した問題を何と呼ぶか？",
      options: [
        "フレーム問題",
        "シンボルグラウンディング問題",
        "チューリング問題",
        "チャットボット問題"
      ],
      correctIndex: 0,
      explanation: "フレーム問題（マッカーシーとヘイズが提唱）。有限の情報処理能力を持つAIが、無限に存在する環境情報から関係ある情報だけを枠（フレーム）づけることの困難さを示します。"
    },
    {
      id: 2,
      category: "人工知能とは",
      question: "記号（シンボル）とその記号が指し示す現実世界の意味（身体性・実体）がどのように結びつくかという問題を何と呼ぶか？",
      options: [
        "シンボルグラウンディング問題",
        "ノーフリーランチ定理",
        "モラベックのパラドックス",
        "オッカムの剃刀"
      ],
      correctIndex: 0,
      explanation: "スティーヴァン・ハルナッドが提唱したシンボルグラウンディング問題。記号論理だけを操作するAIが、現実世界の意味を真に理解できるかの問いです。"
    },
    {
      id: 3,
      category: "人工知能とは",
      question: "人間にとっては高度なチェスや数式処理はAIにとって容易だが、人間の幼児でもできる歩行や物体認識はAIにとって極めて困難であるという逆説を何と呼ぶか？",
      options: [
        "モラベックのパラドックス",
        "チューリングのパラドックス",
        "ポランニーのパラドックス",
        "シンプソンのパラドックス"
      ],
      correctIndex: 0,
      explanation: "モラベックのパラドックス。高度な推論よりも、進化の過程で身につけた無意識の知覚や運動制御のほうがコンピュータによる再現が格段に難しい現象を指します。"
    },
    {
      id: 4,
      category: "人工知能とは",
      question: "1980年代の第2次AIブームの中心となった、特定専門分野の知識ルールを蓄積して推論を行うシステムを何と呼ぶか？",
      options: [
        "エキスパートシステム",
        "パーセプトロン",
        "コネクショニズム",
        "オートマトン"
      ],
      correctIndex: 0,
      explanation: "エキスパートシステム（MYCINやDENDRALが有名）。専門家の「IF-THENルール」を手動入力したシステムですが、知識獲得のボトルネックによりブームは終息しました。"
    },
    {
      id: 5,
      category: "人工知能とは",
      question: "「あらゆる問題に対して万能に優れた機械学習アルゴリズムは存在せず、問題によって向き不向きがある」ことを数学的に示した定理はどれか？",
      options: [
        "ノーフリーランチ定理",
        "中心極限定理",
        "大数の法則",
        "ベイズの定理"
      ],
      correctIndex: 0,
      explanation: "ノーフリーランチ（NFL）定理。すべての可能な問題の平均をとると、いかなる学習手法も他の手法と同等の性能しか出せないという定理です。"
    },

    // === 2. 機械学習 ===
    {
      id: 6,
      category: "機械学習",
      question: "正則化項として『重みの絶対値の和（L1ノルム）』を損失関数に加え、不要な特徴量の重みを0にしてスパース化（特徴量選択）を促す回帰手法はどれか？",
      options: [
        "Lasso回帰（L1正則化）",
        "Ridge回帰（L2正則化）",
        "ロジスティック回帰",
        "主成分回帰"
      ],
      correctIndex: 0,
      explanation: "L1正則化を用いるLasso回帰。不要な特徴量の係数を厳密に0にするため特徴選択の効果があります。重みの2乗和を加えるのはL2正則化（Ridge回帰）です。"
    },
    {
      id: 7,
      category: "機械学習",
      question: "「実際に陽性であるデータのうち、モデルが正しく陽性と予測できた割合」を表し、病気のスクリーニングなど見落としを最小化したい場面で重視される評価指標はどれか？",
      options: [
        "再現率（Recall）",
        "適合率（Precision）",
        "正解率（Accuracy）",
        "特異度（Specificity）"
      ],
      correctIndex: 0,
      explanation: "再現率（Recall = TP / (TP + FN)）。実際陽性を見逃さない指標です。逆に「陽性と予測したうち本当に陽性だった割合」は適合率（Precision）です。"
    },
    {
      id: 8,
      category: "機械学習",
      question: "ランダムフォレストにおいて、訓練データから復元抽出（重複を許すランダムサンプリング）して複数のサブセットを作成し、並列に多数の決定木を学習させるアンサンブル手法はどれか？",
      options: [
        "バギング（ブートストラップ・アグリゲーティング）",
        "ブースティング",
        "スタッキング",
        "クロスバリデーション"
      ],
      correctIndex: 0,
      explanation: "バギング（Bagging）。並列に独立したモデルを作って平均/多数決をとる手法で分散（バリアンス）を減らします。逐次的に誤答を重み付け学習するのはブースティングです。"
    },
    {
      id: 9,
      category: "機械学習",
      question: "サポートベクターマシン（SVM）において、低次元では線形分離できないデータを高次元空間へ写像して線形分離を可能にする手法を何と呼ぶか？",
      options: [
        "カーネルトリック",
        "ソフトマージン",
        "次元削減",
        "スパースモデリング"
      ],
      correctIndex: 0,
      explanation: "カーネルトリック（RBFカーネルや多項式カーネル）。高次元の座標を具体的に計算することなく、内積計算だけで高次元非線形境界を引くことができます。"
    },
    {
      id: 10,
      category: "機械学習",
      question: "クラスタリングアルゴリズムであるk-means法の性質として最も適切なものはどれか？",
      options: [
        "初期クラスタ中心の配置によって結果が局所最適解に陥る可能性がある",
        "クラスタ数kをアルゴリズム自身が自動的に最適決定する",
        "階層的にデンドログラムを構築してクラスタを可視化する",
        "データに外れ値があっても中心点計算に一切影響を受けない"
      ],
      correctIndex: 0,
      explanation: "k-meansは非階層型クラスタリングで、初期値依存性があります（改善版としてk-means++が存在）。クラスタ数kは事前に人間が指定する必要があります。"
    },

    // === 3. ディープラーニング ===
    {
      id: 11,
      category: "ディープラーニング",
      question: "Sigmoid関数に代わり深層学習の隠れ層で標準的に用いられ、入力が0以下で0、0より大きい場合にそのまま出力することで勾配消失問題を劇的に緩和した活性化関数はどれか？",
      options: [
        "ReLU（正規化線形関数）",
        "Softmax関数",
        "Tanh（双曲線正接）関数",
        "Step関数"
      ],
      correctIndex: 0,
      explanation: "ReLU（Rectified Linear Unit: max(0, x)）。正の領域で勾配が常に1となるため、層が深くなっても勾配消失を起こしにくく、計算も高速です。"
    },
    {
      id: 12,
      category: "ディープラーニング",
      question: "畳み込みニューラルネットワーク（CNN）において、1層ごとの残差（F(x) = H(x) - x）を学習させ、入力をスキップ結合（Shortcut Connection）で直接加算することで100層以上の超深層化を実現した名作モデルはどれか？",
      options: [
        "ResNet",
        "AlexNet",
        "VGG",
        "GoogLeNet"
      ],
      correctIndex: 0,
      explanation: "ResNet（Residual Network, 2015年）。スキップ結合により勾配が直接下流へ流れるため、超深層ネットワークでも勾配消失を起こさず学習可能です。"
    },
    {
      id: 13,
      category: "ディープラーニング",
      question: "学習中の各ミニバッチごとに、隠れ層の出力を平均0・分散1に正規化した上でスケーリング・シフトを行うことで、学習の高速化・初期値依存の軽減・過学習抑制を同時に実現する手法はどれか？",
      options: [
        "バッチ正規化（Batch Normalization）",
        "ドロップアウト",
        "データ拡張（Data Augmentation）",
        "勾配クリッピング"
      ],
      correctIndex: 0,
      explanation: "バッチ正規化（Ioffe & Szegedy, 2015）。内部共変量シフトを抑え、高い学習率を設定できるようになり学習が大幅に安定・高速化します。"
    },
    {
      id: 14,
      category: "ディープラーニング",
      question: "勾配の過去の履歴を指数移動平均で捉える「モメンタム」と、勾配の二乗和で学習率を要素ごとに適応調整する「RMSprop」を組み合わせた、最も広く使われるオプティマイザはどれか？",
      options: [
        "Adam",
        "SGD",
        "AdaGrad",
        "Momentum SGD"
      ],
      correctIndex: 0,
      explanation: "Adam（Adaptive Moment Estimation）。1次モーメント（方向/勢い）と2次モーメント（ステップ幅の調整）を両方組み込み、ハイパーパラメータの既定値でも極めて安定して動作します。"
    },
    {
      id: 15,
      category: "ディープラーニング",
      question: "従来の再帰型ニューラルネットワーク（RNN）が抱えていた長期記憶の喪失（長期依存性の学習困難）を解決するため、忘却ゲート・入力ゲート・出力ゲートを備えたモデルはどれか？",
      options: [
        "LSTM（Long Short-Term Memory）",
        "オートエンコーダ",
        "エルマンネット",
        "ボルツマンマシン"
      ],
      correctIndex: 0,
      explanation: "LSTM（Hochreiter & Schmidhuber, 1997）。セル状態（CEC）と3つのゲートによって情報を何ステップも保持・更新でき、長期依存性を学習できます。"
    },

    // === 4. 生成AI ===
    {
      id: 16,
      category: "生成AI",
      question: "Transformerの根幹技術であり、入力文中の全トークン間の関連度（内積）を行列計算して重み付けし、文脈に応じた表現を並列に獲得する機構を何と呼ぶか？",
      options: [
        "Self-Attention（自己注意機構）",
        "畳み込み（Convolution）",
        "プーリング（Pooling）",
        "逆伝播（Backpropagation）"
      ],
      correctIndex: 0,
      explanation: "Self-Attention機構（Attention Is All You Need, 2017）。Query, Key, Valueの行列積を用いて、系列内のすべての単語ペアの関係性をRNNのような再帰を使わずに並列計算します。"
    },
    {
      id: 17,
      category: "生成AI",
      question: "大規模言語モデル（LLM）の全重みを再学習する代わりに、モデルの重み行列に低ランクの分解行列（AとB）を追加してそこだけを学習させる高効率なファインチューニング手法はどれか？",
      options: [
        "LoRA（Low-Rank Adaptation）",
        "全パラメータ・ファインチューニング",
        "ゼロショット学習",
        "蒸留（Knowledge Distillation）"
      ],
      correctIndex: 0,
      explanation: "LoRA（PEFTの一種）。元の重み W を凍結し、ΔW = B × A（低ランク）のみを学習させることで、メモリ使用量と学習パラメータ数を1/10000近くまで削減できます。"
    },
    {
      id: 18,
      category: "生成AI",
      question: "LLMのハルシネーション（事実無根の出力）を抑制し、社内文書や最新ニュースなどの外部知識ベースをベクトル検索してプロンプトに動的注入して回答させるアーキテクチャはどれか？",
      options: [
        "RAG（Retrieval-Augmented Generation: 検索拡張生成）",
        "RLHF（人間のフィードバックによる強化学習）",
        "DPO（直接選好最適化）",
        "Few-shotプロンプティング"
      ],
      correctIndex: 0,
      explanation: "RAG（検索拡張生成）。モデルを再学習することなく、最新・固有のデータベースから検索した正確な根拠文書をコンテキストとしてモデルに渡すことでハルシネーションを防ぎます。"
    },
    {
      id: 19,
      category: "生成AI",
      question: "「ステップ・バイ・ステップで順を追って論理的に考えてください」のように、推論の思考プロセスを出力させることで複雑な計算や論理パズルの正答率を飛躍的に高める手法を何と呼ぶか？",
      options: [
        "CoT（Chain-of-Thought: 思考の連鎖）",
        "Zero-shotプロンプティング",
        "自己整合性（Self-Consistency）",
        "ネガティブプロンプティング"
      ],
      correctIndex: 0,
      explanation: "CoT（思考の連鎖）。最終的な答えだけを即座に出力させるのではなく、途中の推論ステップを段階的に言語化させることでLLMの推論能力を引き出す手法です。"
    },
    {
      id: 20,
      category: "生成AI",
      question: "自然言語のテキストと画像を同一の共通ベクトル空間に埋め込み、両者の類似度（コサイン類似度）を対照学習によって最大化させたマルチモーダル基盤モデルはどれか？",
      options: [
        "CLIP（Contrastive Language-Image Pre-training）",
        "BERT",
        "ResNet-50",
        "Word2Vec"
      ],
      correctIndex: 0,
      explanation: "OpenAIが開発したCLIP。画像エンコーダとテキストエンコーダを対照学習させ、ゼロショット画像分類や画像生成モデル（Stable Diffusion等）のテキスト条件付けの基盤となっています。"
    },

    // === 5. 法律・倫理・社会実装 ===
    {
      id: 21,
      category: "法律・倫理・社会実装",
      question: "日本の著作権法第30条の4における「AI機械学習のための著作物利用」に関する規定として最も適切なものはどれか？",
      options: [
        "著作物に表現された思想・感情を享受することを目的としない場合、営利・非営利を問わず原則として許諾なく利用できる",
        "学術研究目的に限って利用が認められ、商用サービスの学習には一切利用できない",
        "事前に著作権者の許諾を得るか、公的な補償金を支払わなければ学習利用できない",
        "テキストデータのみ許諾不要であり、画像や音楽データの学習はすべて著作権侵害となる"
      ],
      correctIndex: 0,
      explanation: "著作権法第30条の4。情報解析などの「著作物に表現された思想・感情の享受を目的としない利用」については、著作権者の利益を不当に害する場合を除き、営利目的であっても許諾なく利用可能です。"
    },
    {
      id: 22,
      category: "法律・倫理・社会実装",
      question: "欧州連合（EU）の「AI法（EU AI Act）」が採用している規制アプローチとして最も適切なものはどれか？",
      options: [
        "AIシステムの危険度に応じる「リスクベースアプローチ（容認不可・高リスク・限定的リスク・最小リスク）」",
        "すべてのAIモデルを一律に全面禁止する包括的禁止アプローチ",
        "オープンソースのAIのみを厳格に規制し、商用AIは自主規制に委ねるアプローチ",
        "モデルのパラメータ数のみを基準としてハードウェアを物理制限するアプローチ"
      ],
      correctIndex: 0,
      explanation: "EU AI Actはリスクベースアプローチを採用。社会的スコアリングや無差別な生体認証など「容認できないリスク」は全面禁止、医療や重要インフラ等「高リスク」には厳格な適合義務を課します。"
    },
    {
      id: 23,
      category: "法律・倫理・社会実装",
      question: "複雑なブラックボックスモデル（深層学習など）の個々の予測結果に対して、ゲーム理論のシャープレイ値に基づいて各特徴量が予測にどの程度寄与したかを定量的に説明する手法はどれか？",
      options: [
        "SHAP（SHapley Additive exPlanations）",
        "LIME",
        "Grad-CAM",
        "t-SNE"
      ],
      correctIndex: 0,
      explanation: "SHAP。協力ゲーム理論のシャープレイ値（Shapley value）を応用し、特徴量の貢献度を公平かつ加法的に分配して説明性（XAI）を提供する手法です。"
    },
    {
      id: 24,
      category: "法律・倫理・社会実装",
      question: "AIモデルが特定の性別や人種、年齢に対して不当に不利な予測を下す「AIバイアス」の主な原因として、最も根本的なものはどれか？",
      options: [
        "訓練データ自体に歴史的・社会的な偏りやサンプリングの不均衡が含まれていること",
        "プログラミング言語のコンパイラに文法的な欠陥が存在すること",
        "GPUの浮動小数点演算における丸め誤差の蓄積",
        "インターネット回線の通信レイテンシー"
      ],
      correctIndex: 0,
      explanation: "AIバイアスの主因は訓練データの偏り（歴史的バイアス、表現の偏り、ラベル付けバイアス等）です。AIは過去のデータからパターンを学ぶため、データ中の差別や偏見をそのまま学習・増幅してしまいます。"
    },
    {
      id: 25,
      category: "法律・倫理・社会実装",
      question: "日本の個人情報保護法において、「他の情報と照合しない限り特定の個人を識別することができないように加工した個人に関する情報」を何と呼ぶか？",
      options: [
        "仮名加工情報",
        "匿名加工情報",
        "要配慮個人情報",
        "オープンデータ"
      ],
      correctIndex: 0,
      explanation: "仮名加工情報。内部分析やAI研究開発の促進を目的に2020年改正法で新設されました。完全に復元できないよう加工した「匿名加工情報」とは異なり、第三者提供は原則禁止されています。"
    }
  ];
}