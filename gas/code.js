// ====================================================
// LHD (Line Holiday & Delay) - Google Apps Script (GAS) バックエンド
// 遅刻・早退・休み連絡 管理システム
// ====================================================

// ⚙️ LINE Developersから取得した値をここに貼り付けます
const CHANNEL_ACCESS_TOKEN = 'YOUR_CHANNEL_ACCESS_TOKEN';
const LIFF_ID = 'YOUR_LIFF_ID';

// ⚙️ 管理者通知用：通知を受け取りたい管理者のLINEユーザーIDを配列に追加してください
// ※LINE公式アカウントに「マイID」と送信すると、自身のIDが返信されます
const ADMIN_LINE_USER_IDS = [
  // 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
];

// ----------------------------------------------------
// 1. スプレッドシート初期化処理
// ----------------------------------------------------
function initSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 「連絡履歴」シート
  let historySheet = ss.getSheetByName('連絡履歴');
  if (!historySheet) {
    historySheet = ss.insertSheet('連絡履歴');
  }
  historySheet.clear();
  historySheet.appendRow([
    '申請日時',
    '社員名',
    '所属現場',
    '対象日',
    '種別',
    '予定時刻',
    '理由',
    '詳細理由(備考)',
    'LINEユーザーID'
  ]);
  historySheet.getRange('A1:I1').setBackground('#06C755').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  historySheet.setFrozenRows(1);

  // 2. 「ユーザー管理」シート
  let userSheet = ss.getSheetByName('ユーザー管理');
  if (!userSheet) {
    userSheet = ss.insertSheet('ユーザー管理');
  }
  userSheet.clear();
  userSheet.appendRow(['LINEユーザーID', 'LINE表示名', '社員名', '所属現場', '登録日時']);
  userSheet.getRange('A1:E1').setBackground('#4a90e2').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  userSheet.setFrozenRows(1);

  // 3. 「現場マスタ」シート
  let workplaceSheet = ss.getSheetByName('現場マスタ');
  if (!workplaceSheet) {
    workplaceSheet = ss.insertSheet('現場マスタ');
  }
  workplaceSheet.clear();
  workplaceSheet.appendRow(['現場名', '所定労働日数(月)', '備考']);
  workplaceSheet.appendRow(['本社', 21, 'カレンダー通り']);
  workplaceSheet.appendRow(['A現場', 22, '平日勤務']);
  workplaceSheet.appendRow(['B現場', 20, 'シフト制']);
  workplaceSheet.getRange('A1:C1').setBackground('#f5a623').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  workplaceSheet.setFrozenRows(1);

  // 4. 「集計ダッシュボード」シート
  let dashSheet = ss.getSheetByName('集計ダッシュボード');
  if (!dashSheet) {
    dashSheet = ss.insertSheet('集計ダッシュボード');
  }
  dashSheet.clear();

  // ダッシュボードタイトル
  dashSheet.getRange('A1:H1').merge().setValue('📊 従業員別 勤怠サマリー & 出勤率 ダッシュボード')
    .setFontSize(14).setFontWeight('bold').setBackground('#2c3e50').setFontColor('#ffffff').setHorizontalAlignment('center');
  
  dashSheet.getRange('A2:H2').merge().setValue('※有給休暇は出勤扱い（欠勤に含めない）／遅刻・早退は回数カウントのみ／出勤率 ＝ (所定日数 - 欠勤日数) ÷ 所定日数')
    .setFontSize(9).setFontColor('#7f8c8d').setHorizontalAlignment('left');

  // ヘッダー
  dashSheet.appendRow([
    '社員名',
    '所属現場',
    '所定労働日数',
    '欠勤日数',
    '有給取得数',
    '遅刻回数',
    '早退回数',
    '出勤率'
  ]);
  dashSheet.getRange('A3:H3').setBackground('#34495e').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  dashSheet.setFrozenRows(3);

  // サンプル数式行をユーザー管理から反映する数式（10行分テンプレート）
  for (let i = 4; i <= 20; i++) {
    const userRow = i - 2; // ユーザー管理シートの行番号(2から)
    dashSheet.getRange(`A${i}`).setFormula(`=IF(ISBLANK(ユーザー管理!C${userRow}), "", ユーザー管理!C${userRow})`);
    dashSheet.getRange(`B${i}`).setFormula(`=IF(ISBLANK(A${i}), "", ユーザー管理!D${userRow})`);
    dashSheet.getRange(`C${i}`).setFormula(`=IF(ISBLANK(A${i}), "", IFERROR(VLOOKUP(B${i}, 現場マスタ!A:B, 2, FALSE), 20))`);
    dashSheet.getRange(`D${i}`).setFormula(`=IF(ISBLANK(A${i}), "", COUNTIFS(連絡履歴!B:B, A${i}, 連絡履歴!E:E, "欠勤"))`);
    dashSheet.getRange(`E${i}`).setFormula(`=IF(ISBLANK(A${i}), "", COUNTIFS(連絡履歴!B:B, A${i}, 連絡履歴!E:E, "有給"))`);
    dashSheet.getRange(`F${i}`).setFormula(`=IF(ISBLANK(A${i}), "", COUNTIFS(連絡履歴!B:B, A${i}, 連絡履歴!E:E, "遅刻"))`);
    dashSheet.getRange(`G${i}`).setFormula(`=IF(ISBLANK(A${i}), "", COUNTIFS(連絡履歴!B:B, A${i}, 連絡履歴!E:E, "早退"))`);
    dashSheet.getRange(`H${i}`).setFormula(`=IF(ISBLANK(A${i}), "", IF(C${i}>0, (C${i}-D${i})/C${i}, 1))`);
    dashSheet.getRange(`H${i}`).setNumberFormat('0.0%');
  }

  // グラフのクリアと再生成
  const existingCharts = dashSheet.getCharts();
  existingCharts.forEach(c => dashSheet.removeChart(c));

  // グラフ1: 従業員別 出勤率バーグラフ
  const rateChart = dashSheet.newChart()
    .asBarChart()
    .addRange(dashSheet.getRange('A3:A15'))
    .addRange(dashSheet.getRange('H3:H15'))
    .setPosition(2, 10, 0, 0)
    .setOption('title', '📈 従業員別 出勤率 (%)')
    .setOption('legend', { position: 'none' })
    .setOption('hAxis', { minValue: 0, maxValue: 1, format: 'percent' })
    .setOption('colors', ['#06C755'])
    .build();
  dashSheet.insertChart(rateChart);

  // グラフ2: 連絡種別内訳（円グラフ用データ集計欄をJ23以降に作成）
  dashSheet.getRange('J22:K22').setBackground('#34495e').setFontColor('#ffffff').setFontWeight('bold');
  dashSheet.getRange('J22').setValue('連絡種別');
  dashSheet.getRange('K22').setValue('件数');
  dashSheet.getRange('J23').setValue('遅刻');
  dashSheet.getRange('K23').setFormula('=COUNTIF(連絡履歴!E:E, "遅刻")');
  dashSheet.getRange('J24').setValue('早退');
  dashSheet.getRange('K24').setFormula('=COUNTIF(連絡履歴!E:E, "早退")');
  dashSheet.getRange('J25').setValue('欠勤');
  dashSheet.getRange('K25').setFormula('=COUNTIF(連絡履歴!E:E, "欠勤")');
  dashSheet.getRange('J26').setValue('有給');
  dashSheet.getRange('K26').setFormula('=COUNTIF(連絡履歴!E:E, "有給")');

  const pieChart = dashSheet.newChart()
    .asPieChart()
    .addRange(dashSheet.getRange('J22:K26'))
    .setPosition(18, 10, 0, 0)
    .setOption('title', '📊 連絡種別 内訳比率')
    .setOption('pieHole', 0.4)
    .setOption('colors', ['#e67e22', '#f39c12', '#e74c3c', '#3498db'])
    .build();
  dashSheet.insertChart(pieChart);

  // 余分なデフォルトシートの削除
  const defaultSheet = ss.getSheetByName('シート1');
  if (defaultSheet) ss.deleteSheet(defaultSheet);
}

// ----------------------------------------------------
// 2. HTTP GET リクエスト対応 (疎通確認 & ダッシュボードデータ)
// ----------------------------------------------------
function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : null;
  if (action === 'getDashboard') {
    return handleGetDashboard();
  }
  return createJsonResponse({
    status: 'ok',
    system: 'LHD_Line_Holiday',
    message: 'LHD GAS Webhook is running successfully.'
  });
}

// ----------------------------------------------------
// 3. HTTP POST リクエスト対応 (LINE Webhook & LIFF API)
// ----------------------------------------------------
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: 'error', message: 'No content' });
    }

    const data = JSON.parse(e.postData.contents);

    // LINE Developersの検証用空リクエスト対応
    if (data.events && data.events.length === 0) {
      return createJsonResponse({ status: 'ok' });
    }

    // LINE 公式アカウント Webhook イベント対応
    if (data.events && data.events.length > 0) {
      for (const event of data.events) {
        handleLineEvent(event);
      }
      return createJsonResponse({ status: 'ok' });
    }

    // LIFF アプリケーションからの API 呼び出し
    const action = data.action;
    if (!action) {
      return createJsonResponse({ status: 'ok', message: 'No action' });
    }

    let responseData = { error: 'Unknown action' };

    switch (action) {
      case 'initApp':
        responseData = handleInitApp(data);
        break;
      case 'registerUser':
        responseData = handleRegisterUser(data);
        break;
      case 'submitReport':
        responseData = handleSubmitReport(data);
        break;
      case 'getHistory':
        responseData = handleGetHistory(data);
        break;
      default:
        responseData = { error: 'Invalid action: ' + action };
        break;
    }

    return createJsonResponse(responseData);
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createJsonResponse({ error: error.toString() });
  }
}

// ----------------------------------------------------
// 4. LIFF API ハンドラー
// ----------------------------------------------------

// アプリ初期化：ユーザー登録情報 ＆ 現場一覧を取得
function handleInitApp(data) {
  const lineUserId = data.userId;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 現場一覧を取得
  const workplaceSheet = ss.getSheetByName('現場マスタ');
  const workplaces = [];
  if (workplaceSheet) {
    const values = workplaceSheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0]) {
        workplaces.push({
          name: values[i][0],
          days: values[i][1] || 20
        });
      }
    }
  }

  // 2. ユーザー登録状態を確認
  let user = null;
  const userSheet = ss.getSheetByName('ユーザー管理');
  if (userSheet && lineUserId) {
    const userValues = userSheet.getDataRange().getValues();
    for (let i = 1; i < userValues.length; i++) {
      if (userValues[i][0] === lineUserId) {
        user = {
          userId: userValues[i][0],
          displayName: userValues[i][1],
          userName: userValues[i][2],
          workplace: userValues[i][3]
        };
        break;
      }
    }
  }

  return {
    status: 'success',
    registered: !!user,
    user: user,
    workplaces: workplaces
  };
}

// ユーザー情報登録/更新
function handleRegisterUser(data) {
  const { userId, displayName, userName, workplace } = data;
  if (!userId || !userName || !workplace) {
    return { status: 'error', message: '必須項目が不足しています。' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('ユーザー管理');
  const values = userSheet.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === userId) {
      foundRow = i + 1;
      break;
    }
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  if (foundRow > 0) {
    userSheet.getRange(foundRow, 2, 1, 4).setValues([[displayName || '', userName, workplace, now]]);
  } else {
    userSheet.appendRow([userId, displayName || '', userName, workplace, now]);
  }

  return {
    status: 'success',
    user: { userId, displayName, userName, workplace }
  };
}

// 申請送信処理（遅刻・早退・欠勤・有給）
function handleSubmitReport(data) {
  const {
    userId,
    userName,
    workplace,
    type,        // '遅刻', '早退', '欠勤', '有給'
    targetDate,  // 'YYYY-MM-DD'
    targetTime,  // 'HH:mm'（遅刻・早退時、15分刻み）
    reason,      // '体調不良', '交通機関遅延', etc., 'その他'
    detail       // 備考（その他選択時は必須）
  } = data;

  if (!userName || !workplace || !type || !targetDate || !reason) {
    return { status: 'error', message: '必須項目が入力されていません。' };
  }

  if (reason === 'その他' && (!detail || detail.trim() === '')) {
    return { status: 'error', message: '「その他」を選択した場合は、具体的な理由を必ずご記入ください。' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historySheet = ss.getSheetByName('連絡履歴');
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  // 連絡履歴に追記
  historySheet.appendRow([
    now,
    userName,
    workplace,
    targetDate,
    type,
    targetTime || '-',
    reason,
    detail || '',
    userId || ''
  ]);

  // LINEメッセージ通知の作成
  const reportSummary = formatReportSummary({
    now,
    userName,
    workplace,
    type,
    targetDate,
    targetTime,
    reason,
    detail
  });

  // 1. 本人に完了通知メッセージを送信
  if (userId) {
    sendPushMessage(userId, [
      {
        type: 'text',
        text: `【連絡完了】\n以下の内容で連絡を受け付けました。\n\n${reportSummary}`
      }
    ]);
  }

  // 2. 管理者に即時通知
  notifyAdmins(`📢 【勤怠連絡】\n${userName}さんから連絡がありました。\n\n${reportSummary}`);

  return {
    status: 'success',
    message: '連絡が正常に送信されました。'
  };
}

// 本人の直近履歴取得
function handleGetHistory(data) {
  const userId = data.userId;
  if (!userId) {
    return { status: 'error', message: 'User ID is required' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const historySheet = ss.getSheetByName('連絡履歴');
  const values = historySheet.getDataRange().getValues();
  const history = [];

  // 直近15件を取得 (新しい順)
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][8] === userId) {
      history.push({
        timestamp: values[i][0],
        userName: values[i][1],
        workplace: values[i][2],
        targetDate: values[i][3],
        type: values[i][4],
        targetTime: values[i][5],
        reason: values[i][6],
        detail: values[i][7]
      });
      if (history.length >= 15) break;
    }
  }

  return {
    status: 'success',
    history: history
  };
}

// ----------------------------------------------------
// 5. LINE イベント & メッセージ送信処理
// ----------------------------------------------------

function handleLineEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const userText = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  // 「マイID」と送信された場合にIDを返信
  if (userText === 'マイID' || userText.toLowerCase() === 'myid') {
    replyLineMessage(replyToken, [
      {
        type: 'text',
        text: `あなたのLINEユーザーIDは以下の通りです：\n\n${userId}\n\n管理者通知を受け取りたい場合は、GASスクリプトの ADMIN_LINE_USER_IDS にこのIDを追加してください。`
      }
    ]);
    return;
  }

  // その他のメッセージには申請案内を返す
  replyLineMessage(replyToken, [
    {
      type: 'text',
      text: '遅刻・早退・休みの連絡は、下のメニューの「連絡フォームを開く」ボタンから送信してください。'
    }
  ]);
}

// 連絡サマリー整形用
function formatReportSummary(p) {
  let timeStr = '';
  if (p.type === '遅刻') {
    timeStr = `\n出勤予定: ${p.targetTime}`;
  } else if (p.type === '早退') {
    timeStr = `\n退勤予定: ${p.targetTime}`;
  }

  let detailStr = p.detail ? `\n詳細理由: ${p.detail}` : '';

  return `■ 氏名: ${p.userName}（${p.workplace}）\n■ 区分: ${p.type}\n■ 対象日: ${p.targetDate}${timeStr}\n■ 理由: ${p.reason}${detailStr}`;
}

// 管理者への一斉プッシュ通知
function notifyAdmins(text) {
  if (!ADMIN_LINE_USER_IDS || ADMIN_LINE_USER_IDS.length === 0) return;

  for (const adminId of ADMIN_LINE_USER_IDS) {
    if (adminId && adminId.startsWith('U')) {
      sendPushMessage(adminId, [{ type: 'text', text: text }]);
    }
  }
}

// プッシュメッセージ送信 (LINE Messaging API)
function sendPushMessage(toUserId, messages) {
  if (!CHANNEL_ACCESS_TOKEN || CHANNEL_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN') return;

  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: toUserId,
    messages: messages
  };

  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('Push error: ' + err.toString());
  }
}

// 応答メッセージ送信 (LINE Messaging API)
function replyLineMessage(replyToken, messages) {
  if (!CHANNEL_ACCESS_TOKEN || CHANNEL_ACCESS_TOKEN === 'YOUR_CHANNEL_ACCESS_TOKEN') return;

  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: messages
  };

  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('Reply error: ' + err.toString());
  }
}

// JSONレスポンスの生成
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
