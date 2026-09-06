/* =====================================================================
   サイト設定（ここだけ書き換えれば運用できる項目）
   - ビルド不要。保存して main に push すれば GitHub Pages に反映される
   ===================================================================== */
window.SITE_CONFIG = {
  // サイト名と作成者名（ヘッダー・フッター・表題欄で使う）
  siteName: 'GENBA TOOLS',
  siteTagline: '現場で生まれた、ブラウザで動く実務ツール',
  author: 'Shota Onuma',

  // 公開URL（OGP・共有リンク用。末尾スラッシュあり）
  siteUrl: 'https://morioshota.github.io/Claude-code/site/',

  // GitHub リポジトリ（要望をIssueで受ける導線・ソースへのリンク）
  repoUrl: 'https://github.com/morioshota/Claude-code',

  /* ---------- 要望フォームの送信先 ----------
     ① Formspree（推奨・無料枠あり）: https://formspree.io でフォームを作り、
        発行された "https://formspree.io/f/xxxxxxxx" を feedbackEndpoint に貼る。
        送信内容は登録したメールアドレスに届く。回答者側のアカウントは不要。
     ② 空文字のままだと、フォームは「内容をコピー → GitHub Issue で送る」または
        「メールで送る」（contactEmail を設定した場合）に自動で切り替わる。
     ※ Google フォームを使う場合は feedbackFormUrl にフォームのURLを貼ると
        フォームページからそのまま開けるボタンが出る。                       */
  feedbackEndpoint: 'https://formspree.io/f/xyeydweo',
  feedbackFormUrl: '',
  contactEmail: '',          // 例: 'you@example.com'（公開されるので注意）

  // GitHub Issue で受け付けるときのテンプレート名（.github/ISSUE_TEMPLATE/）
  issueTemplate: 'tool-request.yml',
};
