/** ホーム画面に追加する方法（PWA） */
export function InstallGuide() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ash">
      <p>ホーム画面に追加すると、アプリのように全画面で開けます。</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>iPhone: Safari で開き、共有ボタン →「ホーム画面に追加」</li>
        <li>Android: Chrome のメニュー →「ホーム画面に追加」または「アプリをインストール」</li>
      </ul>
    </div>
  );
}
