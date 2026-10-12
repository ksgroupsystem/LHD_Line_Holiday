// ====================================================
// LHD (Line Holiday & Delay) - LIFF フロントエンド スクリプト
// ====================================================

// ?? デプロイ後に取得した「GASのウェブアプリURL」と「LIFF ID」を設定します
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxM85dSPdtmDMZ5nJHpPbLvxyP7-ZFMO_66TpLy5bNxqRCy2JPfWUBjk2SihU90MsYN/exec';
const LIFF_ID = '2011974016-ImTWkYlP';

// アプリケーション状態
const state = {
  lineUserId: null,
  lineDisplayName: null,
  registeredUser: null,
  workplaces: [],
  selectedType: null,
  targetDate: null,
  targetTime: null,
  reason: null,
  detail: '',
  history: []
};

// DOMが読み込まれたら初期化開始
document.addEventListener('DOMContentLoaded', () => {
  initTimeOptions();
  initDateOptions();
  setupEventListeners();
  initLiffApp();
});

// ----------------------------------------------------
// 1. 15分単位の時刻セレクトボックス生成 (06:00 ～ 23:45)
// ----------------------------------------------------
function initTimeOptions() {
  const select = document.getElementById('targetTime');
  select.innerHTML = '<option value="">時刻を選択してください</option>';

  for (let hour = 6; hour <= 23; hour++) {
    const hh = String(hour).padStart(2, '0');
    ['00', '15', '30', '45'].forEach(mm => {
      const timeStr = `${hh}:${mm}`;
      const opt = document.createElement('option');
      opt.value = timeStr;
      opt.textContent = timeStr;
      select.appendChild(opt);
    });
  }
}

// ----------------------------------------------------
// 2. 日付クイック選択の初期化
// ----------------------------------------------------
function initDateOptions() {
  const targetDateInput = document.getElementById('targetDate');
  const today = new Date();
  
  // 今日の日付 (YYYY-MM-DD)
  const todayStr = formatDateISO(today);
  targetDateInput.value = todayStr;
  state.targetDate = todayStr;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ----------------------------------------------------
// 3. イベントリスナーの設定
// ----------------------------------------------------
function setupEventListeners() {
  // 連絡種別カードの選択
  const typeCards = document.querySelectorAll('.type-card');
  typeCards.forEach(card => {
    card.addEventListener('click', () => {
      typeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      const selectedType = card.dataset.type;
      state.selectedType = selectedType;
      document.getElementById('selectedType').value = selectedType;

      const timeSection = document.getElementById('timeSection');
      const timeLabelText = document.getElementById('timeLabelText');
      const timeSelect = document.getElementById('targetTime');

      if (selectedType === '遅刻') {
        timeSection.style.display = 'block';
        timeLabelText.textContent = '出勤予定時刻';
        timeSelect.required = true;
      } else if (selectedType === '早退') {
        timeSection.style.display = 'block';
        timeLabelText.textContent = '退勤予定時刻';
        timeSelect.required = true;
      } else {
        timeSection.style.display = 'none';
        timeSelect.required = false;
        timeSelect.value = '';
        state.targetTime = null;
      }

      validateForm();
    });
  });

  // 日付クイックボタン
  const quickDateBtns = document.querySelectorAll('.btn-quick-date');
  const customDateContainer = document.getElementById('customDateContainer');
  const targetDateInput = document.getElementById('targetDate');

  quickDateBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quickDateBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.id === 'btnCustomDate') {
        customDateContainer.style.display = 'block';
      } else {
        customDateContainer.style.display = 'none';
        const offset = parseInt(btn.dataset.offset, 10);
        const target = new Date();
        target.setDate(target.getDate() + offset);
        const dateStr = formatDateISO(target);
        targetDateInput.value = dateStr;
        state.targetDate = dateStr;
      }
      validateForm();
    });
  });

  targetDateInput.addEventListener('change', (e) => {
    state.targetDate = e.target.value;
    validateForm();
  });

  // 時刻選択
  document.getElementById('targetTime').addEventListener('change', (e) => {
    state.targetTime = e.target.value;
    validateForm();
  });

  // 理由選択
  const reasonSelect = document.getElementById('reasonSelect');
  const detailRequiredBadge = document.getElementById('detailRequiredBadge');
  const detailErrorMsg = document.getElementById('detailErrorMsg');
  const detailReason = document.getElementById('detailReason');

  reasonSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    state.reason = val;
    // 詳細理由は常時必須のためplaceholderは固定
    detailReason.placeholder = '理由や状況の詳細を具体的にご入力ください（必須）';
    validateForm();
  });

  // 詳細理由（自由記述）
  detailReason.addEventListener('input', (e) => {
    state.detail = e.target.value;
    validateForm();
  });

  // 送信ボタン
  document.getElementById('btnSubmit').addEventListener('click', handleSubmit);

  // 履歴アコーディオン
  const historyToggle = document.getElementById('historyToggle');
  const historyList = document.getElementById('historyList');
  const toggleIcon = document.getElementById('historyToggleIcon');
  historyToggle.addEventListener('click', () => {
    const isClosed = historyList.style.display === 'none';
    historyList.style.display = isClosed ? 'flex' : 'none';
    toggleIcon.classList.toggle('open', isClosed);
  });

  // ユーザー情報変更ボタン（ヘッダー右上）
  const userBadge = document.getElementById('userBadge');
  if (userBadge) {
    userBadge.addEventListener('click', openUserModal);
  }
  const btnEditUser = document.getElementById('btnEditUser');
  if (btnEditUser) {
    btnEditUser.addEventListener('click', (e) => {
      e.stopPropagation();
      openUserModal();
    });
  }

  // ユーザー登録保存ボタン
  document.getElementById('btnSaveUser').addEventListener('click', handleSaveUser);

  // 完了モーダルを閉じる
  document.getElementById('btnCloseSuccess').addEventListener('click', () => {
    document.getElementById('successModal').style.display = 'none';
    // フォームリセット
    resetForm();
  });
}

// ----------------------------------------------------
// 4. バリデーション処理
// ----------------------------------------------------
function validateForm() {
  const btnSubmit = document.getElementById('btnSubmit');
  const detailErrorMsg = document.getElementById('detailErrorMsg');

  // 1. ユーザー情報が登録されているか
  if (!state.registeredUser) {
    btnSubmit.disabled = true;
    return false;
  }

  // 2. 種別が選択されているか
  if (!state.selectedType) {
    btnSubmit.disabled = true;
    return false;
  }

  // 3. 対象日があるか
  if (!state.targetDate) {
    btnSubmit.disabled = true;
    return false;
  }

  // 4. 遅刻・早退の場合の時刻チェック (15分刻み)
  if (state.selectedType === '遅刻' || state.selectedType === '早退') {
    if (!state.targetTime) {
      btnSubmit.disabled = true;
      return false;
    }
  }

  // 5. 理由選択チェック
  if (!state.reason) {
    btnSubmit.disabled = true;
    return false;
  }

  // 6. 詳細理由・備考は常に必須
  if (!state.detail || state.detail.trim() === '') {
    detailErrorMsg.style.display = 'block';
    btnSubmit.disabled = true;
    return false;
  } else {
    detailErrorMsg.style.display = 'none';
  }

  // 全てOKなら送信可能
  btnSubmit.disabled = false;
  return true;
}

// ----------------------------------------------------
// 5. LIFF 初期化 & データ取得
// ----------------------------------------------------
async function initLiffApp() {
  showLoading('システムに接続中...');

  try {
    if (typeof liff !== 'undefined' && LIFF_ID && LIFF_ID !== 'YOUR_LIFF_ID') {
      await liff.init({ liffId: LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      const profile = await liff.getProfile();
      state.lineUserId = profile.userId;
      state.lineDisplayName = profile.displayName;
    } else {
      // 開発/ブラウザテスト用モックID
      console.warn('Running in dev/mock mode.');
      state.lineUserId = 'U_DEV_TEST_USER';
      state.lineDisplayName = 'テストユーザー';
    }

    // GASから登録状態と現場マスタを取得
    await loadInitialData();
  } catch (err) {
    console.error('LIFF Init error:', err);
    alert('初期化中にエラーが発生しました: ' + err.message);
  } finally {
    hideLoading();
  }
}

// GASからアプリ初期データを取得
async function loadInitialData() {
  if (!GAS_API_URL || GAS_API_URL === 'YOUR_GAS_WEB_APP_URL') {
    // GASのURLが未設定の場合のローカルダミー現場
    state.workplaces = [
      { name: '本社', days: 21 },
      { name: 'A現場', days: 22 },
      { name: 'B現場', days: 20 }
    ];
    updateWorkplaceSelect();
    checkUserRegistration();
    return;
  }

  try {
    const res = await callGasApi({
      action: 'initApp',
      userId: state.lineUserId
    });

    if (res.status === 'success') {
      state.workplaces = res.workplaces || [];
      updateWorkplaceSelect();

      if (res.registered && res.user) {
        state.registeredUser = res.user;
        updateUserUI();
        loadHistory();
      } else {
        openUserModal();
      }
    }
  } catch (e) {
    console.error('Load initial data error:', e);
  }
}

// 現場プルダウンの更新
function updateWorkplaceSelect() {
  const select = document.getElementById('selectWorkplace');
  select.innerHTML = '<option value="">現場を選択してください</option>';
  state.workplaces.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.name;
    opt.textContent = w.name;
    select.appendChild(opt);
  });
}

// ユーザー情報表示の更新
function updateUserUI() {
  const badge = document.getElementById('userBadge');
  const nameSpan = document.getElementById('badgeUserName');
  const workplaceSpan = document.getElementById('badgeWorkplace');

  if (state.registeredUser) {
    badge.style.display = 'flex';
    nameSpan.textContent = state.registeredUser.userName;
    workplaceSpan.textContent = state.registeredUser.workplace;

    const quickBar = document.getElementById('userQuickBar');
    const quickName = document.getElementById('quickUserName');
    const quickWorkplace = document.getElementById('quickWorkplace');
    if (quickBar && quickName && quickWorkplace) {
      quickBar.style.display = 'flex';
      quickName.textContent = state.registeredUser.userName;
      quickWorkplace.textContent = state.registeredUser.workplace;
    }
  }
  validateForm();
}

// ユーザー情報登録・編集モーダル
function openUserModal() {
  const modal = document.getElementById('userModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalIntro = document.getElementById('modalIntro');
  const btnSaveUser = document.getElementById('btnSaveUser');
  const inputLastName = document.getElementById('inputLastName');
  const inputFirstName = document.getElementById('inputFirstName');
  const selectWorkplace = document.getElementById('selectWorkplace');

  if (state.registeredUser && state.registeredUser.userName) {
    // 編集モード
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-user-pen"></i> 登録情報の変更';
    if (modalIntro) modalIntro.textContent = '氏名や所属現場の変更内容を入力し、「変更を保存する」を押してください。';
    if (btnSaveUser) btnSaveUser.textContent = '変更を保存する';

    const parts = state.registeredUser.userName.split(/[\s　]+/);
    inputLastName.value = parts[0] || '';
    inputFirstName.value = parts.slice(1).join(' ') || '';
    selectWorkplace.value = state.registeredUser.workplace || '';
  } else {
    // 初回登録モード
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-id-card"></i> 従業員情報の初回登録';
    if (modalIntro) modalIntro.textContent = '初回利用時は、ご自身の氏名と所属現場を登録してください。';
    if (btnSaveUser) btnSaveUser.textContent = '登録して始める';

    if (state.lineDisplayName) {
      const parts = state.lineDisplayName.split(/[\s　]+/);
      if (parts.length > 1) {
        inputLastName.value = parts[0];
        inputFirstName.value = parts.slice(1).join(' ');
      } else {
        inputLastName.value = state.lineDisplayName;
        inputFirstName.value = '';
      }
    } else {
      inputLastName.value = '';
      inputFirstName.value = '';
    }
  }

  modal.style.display = 'flex';
}

async function handleSaveUser() {
  const lastName = document.getElementById('inputLastName').value.trim();
  const firstName = document.getElementById('inputFirstName').value.trim();
  const workplace = document.getElementById('selectWorkplace').value;

  if (!lastName || !firstName) {
    alert('姓（名字）とお名前を両方とも必ず入力してください。');
    return;
  }
  if (!workplace) {
    alert('所属現場を選択してください。');
    return;
  }

  // 姓と名の間に半角スペースを入れてフルネーム化
  const userName = `${lastName} ${firstName}`;

  showLoading('登録情報を保存中...');
  try {
    const res = await callGasApi({
      action: 'registerUser',
      userId: state.lineUserId,
      displayName: state.lineDisplayName,
      userName: userName,
      workplace: workplace
    });

    if (res.status === 'success' || !res.error) {
      state.registeredUser = {
        userId: state.lineUserId,
        displayName: state.lineDisplayName,
        userName: userName,
        workplace: workplace
      };
      updateUserUI();
      document.getElementById('userModal').style.display = 'none';
      loadHistory();
    } else {
      alert('保存に失敗しました: ' + (res.message || res.error));
    }
  } catch (err) {
    alert('保存通信エラー: ' + err.message);
  } finally {
    hideLoading();
  }
}

// ----------------------------------------------------
// 6. 連絡送信処理
// ----------------------------------------------------
async function handleSubmit() {
  if (!validateForm()) return;

  showLoading('連絡を送信中...');

  const payload = {
    action: 'submitReport',
    userId: state.lineUserId,
    userName: state.registeredUser.userName,
    workplace: state.registeredUser.workplace,
    type: state.selectedType,
    targetDate: state.targetDate,
    targetTime: state.targetTime || '',
    reason: state.reason,
    detail: state.detail || ''
  };

  try {
    const res = await callGasApi(payload);
    if (res.status === 'success') {
      document.getElementById('successModal').style.display = 'flex';
      loadHistory();
    } else {
      alert('送信に失敗しました: ' + (res.message || res.error));
    }
  } catch (err) {
    alert('送信エラー: ' + err.message);
  } finally {
    hideLoading();
  }
}

// 履歴読み込み & 当月サマリー反映
async function loadHistory() {
  if (!state.lineUserId) return;

  try {
    const res = await callGasApi({
      action: 'getHistory',
      userId: state.lineUserId
    });

    if (res.status === 'success') {
      if (res.history) {
        renderHistory(res.history);
      }
      if (res.monthlyStats) {
        const card = document.getElementById('monthlySummaryCard');
        if (card) card.style.display = 'block';
        const label = document.getElementById('currentMonthLabel');
        if (label) label.textContent = res.monthlyStats.monthLabel || '今月';
        
        document.getElementById('statLateCount').textContent = res.monthlyStats.late || 0;
        document.getElementById('statEarlyCount').textContent = res.monthlyStats.early || 0;
        document.getElementById('statAbsentCount').textContent = res.monthlyStats.absent || 0;
        document.getElementById('statPaidCount').textContent = res.monthlyStats.paid || 0;
      }
    }
  } catch (err) {
    console.error('History load error:', err);
  }
}

function renderHistory(list) {
  const container = document.getElementById('historyList');
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="history-empty">履歴はありません</div>';
    return;
  }

  container.innerHTML = '';
  list.forEach(item => {
    const isCanceled = (item.status === '取消済');
    const div = document.createElement('div');
    div.className = `history-item ${isCanceled ? 'is-canceled' : ''}`;

    let timeDetail = '';
    if (item.targetTime && item.targetTime !== '-') {
      timeDetail = ` (${item.type === '遅刻' ? '出勤' : '退勤'}予定: ${item.targetTime})`;
    }

    const detailText = item.detail ? `<br>備考: ${escapeHtml(item.detail)}` : '';

    let footerHtml = '';
    if (isCanceled) {
      footerHtml = `
        <div class="history-footer">
          <span class="history-status-badge badge-status-canceled">取消済</span>
          <small style="color: var(--text-muted); font-size: 11px;">集計から除外されています</small>
        </div>
      `;
    } else {
      footerHtml = `
        <div class="history-footer">
          <span class="history-status-badge badge-status-valid">受付済</span>
          <button type="button" class="btn-cancel-report" data-row="${item.rowIndex}">
            <i class="fa-regular fa-trash-can"></i> 取消
          </button>
        </div>
      `;
    }

    div.innerHTML = `
      <div class="history-header">
        <span class="history-date">${item.targetDate}</span>
        <span class="history-type-badge badge-${item.type}">${item.type}</span>
      </div>
      <div class="history-body">
        理由: ${escapeHtml(item.reason)}${timeDetail}${detailText}
      </div>
      ${footerHtml}
    `;

    // 取消ボタンのイベント
    if (!isCanceled) {
      const btnCancel = div.querySelector('.btn-cancel-report');
      if (btnCancel) {
        btnCancel.addEventListener('click', (e) => {
          e.stopPropagation();
          onCancelReportClick(item);
        });
      }
    }

    container.appendChild(div);
  });
}

// 申請取消処理
async function onCancelReportClick(item) {
  const confirmMsg = `【申請取消の確認】\n\n対象日: ${item.targetDate}\n区分: ${item.type}\n理由: ${item.reason}\n\nこの申請を取り消しますか？\n※取り消すと出勤率の計算からも除外され、管理者に取消通知が送信されます。`;
  if (!confirm(confirmMsg)) {
    return;
  }

  showLoading('申請を取り消し中...');
  try {
    const res = await callGasApi({
      action: 'cancelReport',
      userId: state.lineUserId,
      rowIndex: item.rowIndex
    });

    if (res.status === 'success') {
      alert('申請を取り消しました。');
      await loadHistory();
    } else {
      alert('取消に失敗しました: ' + (res.message || res.error));
    }
  } catch (err) {
    alert('通信エラー: ' + err.message);
  } finally {
    hideLoading();
  }
}

// フォームリセット
function resetForm() {
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('active'));
  state.selectedType = null;
  document.getElementById('selectedType').value = '';

  document.getElementById('timeSection').style.display = 'none';
  document.getElementById('targetTime').value = '';
  state.targetTime = null;

  document.getElementById('reasonSelect').value = '';
  state.reason = null;

  document.getElementById('detailReason').value = '';
  state.detail = '';

  document.getElementById('detailRequiredBadge').style.display = 'none';
  document.getElementById('detailErrorMsg').style.display = 'none';

  initDateOptions();
  document.querySelectorAll('.btn-quick-date').forEach((b, idx) => {
    b.classList.toggle('active', idx === 0);
  });
  document.getElementById('customDateContainer').style.display = 'none';

  validateForm();
}

// ----------------------------------------------------
// 7. ユーティリティ
// ----------------------------------------------------
async function callGasApi(data) {
  if (!GAS_API_URL || GAS_API_URL === 'YOUR_GAS_WEB_APP_URL') {
    console.log('[Dev Mock API Call]:', data);
    return { status: 'success', message: 'Mock Success' };
  }

  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8' // GAS CORS制約回避
    },
    body: JSON.stringify(data)
  });

  return await res.json();
}

function showLoading(text) {
  const overlay = document.getElementById('loadingOverlay');
  if (text) document.getElementById('loadingText').textContent = text;
  overlay.style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
