(() => {
  const $ = (id) => document.getElementById(id);
  const API_BASE_STORAGE_KEY = "iap-api-base";
  const AUTH_TOKEN_STORAGE_KEY = "iap-auth-token";
  const AUTH_USER_STORAGE_KEY = "iap-auth-user";
  const EXCHANGE_RATE_STORAGE_KEY = "iap-dashboard-exchange-rates";
  const DEFAULT_EXPENSE_USER = "dashboard";
  const DEFAULT_STORE_FRONT = "USA";
  const DEFAULT_CURRENCY = "USD";
  const DEFAULT_AD_PLATFORM = "Google";

  const state = {
    apps: [],
    users: [],
    filteredUsers: [],
    dailyRows: [],
    expenses: [],
    exchangeRates: loadCachedExchangeRates(),
    countries: new Set(),
    selectedBundleIds: new Set(),
    editingExpenseId: "",
    editingExpenseDate: "",
    editingExpenseProjectId: "",
    editingExpenseUser: "",
    authToken: localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "",
    currentUser: readStoredUser(),
  };

  const els = {
    apiBase: $("apiBase"),
    apiReadonly: $("apiReadonly"),
    apiReadonlyValue: $("apiReadonlyValue"),
    sessionCard: $("sessionCard"),
    currentUserName: $("currentUserName"),
    currentUserRole: $("currentUserRole"),
    logoutButton: $("logoutButton"),
    loginModal: $("loginModal"),
    loginForm: $("loginForm"),
    loginApiBase: $("loginApiBase"),
    loginUsername: $("loginUsername"),
    loginPassword: $("loginPassword"),
    loginError: $("loginError"),
    loginSubmitButton: $("loginSubmitButton"),
    appPicker: $("appPicker"),
    appPickerButton: $("appPickerButton"),
    appPickerMenu: $("appPickerMenu"),
    appOptions: $("appOptions"),
    selectedAppsPreview: $("selectedAppsPreview"),
    clearAppSelection: $("clearAppSelection"),
    countrySelect: $("countrySelect"),
    startDateInput: $("startDateInput"),
    endDateInput: $("endDateInput"),
    prevRange: $("prevRange"),
    nextRange: $("nextRange"),
    reloadButton: $("reloadButton"),
    statusText: $("statusText"),
    lastUpdated: $("lastUpdated"),
    metricUsers: $("metricUsers"),
    metricPaidUsers: $("metricPaidUsers"),
    metricCanceledUsers: $("metricCanceledUsers"),
    metricRefundUsers: $("metricRefundUsers"),
    metricActivePaidUsers: $("metricActivePaidUsers"),
    metricRetention: $("metricRetention"),
    metricCpa: $("metricCpa"),
    metricPaidCpa: $("metricPaidCpa"),
    metricProfit: $("metricProfit"),
    metricIncome: $("metricIncome"),
    metricSpend: $("metricSpend"),
    metricSpendSource: $("metricSpendSource"),
    metricRoi: $("metricRoi"),
    dailySummaryTable: $("dailySummaryTable"),
    expenseModal: $("expenseModal"),
    expenseForm: $("expenseForm"),
    expenseCloseButton: $("expenseCloseButton"),
    expenseCancelButton: $("expenseCancelButton"),
    expensePreview: $("expensePreview"),
    expenseAmount: $("expenseAmount"),
    expenseCurrency: $("expenseCurrency"),
    expenseStorefront: $("expenseStorefront"),
    expenseAdPlatform: $("expenseAdPlatform"),
  };

  boot();

  function boot() {
    const savedApiBase = localStorage.getItem(API_BASE_STORAGE_KEY);
    if (savedApiBase) {
      els.apiBase.value = savedApiBase;
    } else {
      localStorage.setItem(API_BASE_STORAGE_KEY, els.apiBase.value);
    }
    els.loginApiBase.value = els.apiBase.value;
    setDefaultRange();
    bindEvents();
    enhanceSelects();
    renderSession();
    loadExchangeRates()
      .finally(restoreSession);
  }

  function bindEvents() {
    els.apiBase.addEventListener("change", () => {
      if (isAuthenticated()) {
        els.apiBase.value = cleanApiBase();
        return;
      }
      applyApiBase(els.apiBase.value);
    });
    els.loginApiBase.addEventListener("change", () => applyApiBase(els.loginApiBase.value));
    els.loginApiBase.addEventListener("input", () => {
      els.apiBase.value = els.loginApiBase.value;
    });

    els.loginForm.addEventListener("submit", handleLoginSubmit);
    els.logoutButton.addEventListener("click", handleLogout);

    els.appPickerButton.addEventListener("click", toggleAppPicker);
    els.clearAppSelection.addEventListener("click", () => {
      state.selectedBundleIds.clear();
      renderAppSelection();
      loadUsers();
    });
    document.addEventListener("click", closeAppPickerOnOutsideClick);
    document.addEventListener("click", closeCustomSelectsOnOutsideClick);
    document.addEventListener("keydown", closeCustomSelectsOnEscape);

    els.countrySelect.addEventListener("change", render);
    els.startDateInput.addEventListener("change", loadUsers);
    els.endDateInput.addEventListener("change", loadUsers);
    els.prevRange.addEventListener("click", () => shiftRange(-1));
    els.nextRange.addEventListener("click", () => shiftRange(1));
    els.reloadButton.addEventListener("click", loadUsers);
    els.dailySummaryTable.addEventListener("click", handleDailySpendClick);
    els.expenseForm.addEventListener("submit", handleExpenseSubmit);
    els.expenseAmount.addEventListener("input", updateExpensePreview);
    els.expenseCurrency.addEventListener("change", updateExpensePreview);
    els.expenseCloseButton.addEventListener("click", closeExpenseModal);
    els.expenseCancelButton.addEventListener("click", closeExpenseModal);
    els.expenseModal.addEventListener("click", (event) => {
      if (event.target === els.expenseModal) closeExpenseModal();
    });
  }

  async function restoreSession() {
    if (!state.authToken) {
      clearAuth();
      requireLogin("请先登录后查看数据");
      return;
    }

    setStatus("正在校验登录状态...");
    try {
      const user = await request("/auth/me");
      setAuthenticated(state.authToken, normalizeAuthUser(user));
      closeLoginModal();
      await loadDashboard();
    } catch (error) {
      clearAuth();
      requireLogin(error.message === "Unauthorized"
        ? "登录已过期，请重新登录"
        : `登录校验失败：${error.message}`);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    applyApiBase(els.loginApiBase.value);

    const username = els.loginUsername.value.trim();
    const password = els.loginPassword.value;
    if (!username || !password) {
      showLoginError("请输入用户名和密码");
      return;
    }

    setLoginBusy(true);
    showLoginError("");

    try {
      const response = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        auth: false,
      });

      if (!response?.token) throw new Error("登录响应缺少 token");

      setAuthenticated(response.token, normalizeAuthUser(response.user || { username }));
      els.loginPassword.value = "";
      closeLoginModal();
      await loadDashboard();
    } catch (error) {
      showLoginError(`登录失败：${error.message}`);
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    const hadToken = Boolean(state.authToken);
    setStatus("正在退出登录...");

    try {
      if (hadToken) {
        await request("/auth/logout", {
          method: "POST",
        });
      }
    } catch {
      // Token may already be invalid. Local logout should still complete.
    } finally {
      clearAuth();
      requireLogin("已退出登录");
    }
  }

  async function loadDashboard() {
    closeLoginModal();
    renderSession();
    await loadApps();
    await loadUsers();
  }

  async function loadApps() {
    if (!isAuthenticated()) {
      requireLogin("请先登录后查看 App 信息");
      return;
    }

    setStatus("正在加载 App 信息...");
    try {
      const apps = await request("/appInfos");
      state.apps = Array.isArray(apps) ? apps : [];
      renderApps();
      setStatus(state.apps.length ? `已加载 ${state.apps.length} 个 App` : "暂无 App 信息");
    } catch (error) {
      state.apps = [];
      renderApps();
      setStatus(`App 信息加载失败：${error.message}`);
    }
  }

  async function loadUsers() {
    if (!isAuthenticated()) {
      requireLogin("请先登录后查看用户数据");
      return;
    }

    normalizeDateRange();
    setBusy(true);
    setStatus("正在加载用户和投入数据...");

    try {
      let expenseLoadError = "";
      const users = await request(`/users${buildUserQuery({ includeCountry: false })}`);
      const expenses = await request(`/daily-expense${buildExpenseQuery()}`)
        .catch((error) => {
          expenseLoadError = error.message;
          return [];
        });
      state.users = normalizeUsers(Array.isArray(users) ? users : []);
      state.expenses = normalizeExpenses(Array.isArray(expenses) ? expenses : []);
      updateCountryOptions();
      render();
      setStatus(expenseLoadError
        ? `已加载 ${state.users.length} 个用户，投入数据加载失败：${expenseLoadError}`
        : `已加载 ${state.users.length} 个用户，${state.expenses.length} 条投入`);
      els.lastUpdated.textContent = `更新于 ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      state.users = [];
      state.filteredUsers = [];
      state.dailyRows = [];
      state.expenses = [];
      updateCountryOptions();
      render();
      setStatus(`数据加载失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadExchangeRates() {
    const cached = readExchangeRateCache();
    if (cached) {
      state.exchangeRates = cached.rates;
      return;
    }

    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const data = await response.json();
      if (data.result !== "success" || !data.rates) throw new Error("汇率响应无效");

      state.exchangeRates = {
        ...data.rates,
        [DEFAULT_CURRENCY]: 1,
      };
      localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, JSON.stringify({
        updatedAt: Date.now(),
        rates: state.exchangeRates,
      }));
    } catch {
      state.exchangeRates = { [DEFAULT_CURRENCY]: 1 };
      setStatus("汇率加载失败，非美元收入暂时无法换算");
    }
  }

  function buildUserQuery({ includeCountry }) {
    const params = new URLSearchParams();
    const { start, end } = rangeBounds();

    selectedBundleIds().forEach((bundleId) => params.append("bid", bundleId));
    if (includeCountry && els.countrySelect.value) params.append("storefront", els.countrySelect.value);
    if (start !== null) params.append("startDate", String(start));
    if (end !== null) params.append("endDate", String(end));

    return toQueryString(params);
  }

  function buildExpenseQuery() {
    const params = new URLSearchParams();
    const { start, end } = rangeBounds();
    const bundleIds = selectedBundleIds();

    if (bundleIds.length === 1) params.append("projectID", bundleIds[0]);
    if (els.countrySelect.value) params.append("storefront", els.countrySelect.value);
    if (start !== null) params.append("startDate", String(start));
    if (end !== null) params.append("endDate", String(end));

    return toQueryString(params);
  }

  function toQueryString(params) {
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  async function request(path, options = {}) {
    const { auth = true, ...fetchOptions } = options;
    const requestOptions = { ...fetchOptions };
    const headers = { ...(requestOptions.headers || {}) };
    const apiBase = cleanApiBase();

    if (requestOptions.body) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    if (auth && state.authToken) headers.Authorization = `Bearer ${state.authToken}`;
    if (Object.keys(headers).length) requestOptions.headers = headers;

    let response;
    try {
      response = await fetch(`${apiBase}${path}`, requestOptions);
    } catch {
      throw new Error("无法连接 API，可能是服务未启动或后端未开启 CORS");
    }

    if (response.status === 401) {
      if (auth) {
        clearAuth();
        requireLogin("登录已过期，请重新登录");
      }
      throw new Error("Unauthorized");
    }
    if (response.status === 403) throw new Error("权限不足");
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function renderApps() {
    const selected = new Set(selectedBundleIds());
    els.appOptions.innerHTML = "";

    state.apps.forEach((app) => {
      const option = document.createElement("button");
      option.className = "app-option";
      option.type = "button";
      option.dataset.bundleId = app.bundleId;
      option.innerHTML = `
        ${app.artworkUrl ? `<img src="${escapeHtml(app.artworkUrl)}" alt="">` : `<span class="app-icon-placeholder">${escapeHtml(appInitial(app))}</span>`}
        <span>
          <strong>${escapeHtml(app.trackName || app.bundleId)}</strong>
          <small>${escapeHtml(app.bundleId)}</small>
        </span>
        <span class="app-check">${selected.has(app.bundleId) ? "✓" : ""}</span>
      `;
      option.addEventListener("click", () => {
        if (state.selectedBundleIds.has(app.bundleId)) {
          state.selectedBundleIds.delete(app.bundleId);
        } else {
          state.selectedBundleIds.add(app.bundleId);
        }
        renderAppSelection();
        loadUsers();
      });
      els.appOptions.appendChild(option);
    });

    renderAppSelection();
  }

  function renderAppSelection() {
    const selectedApps = selectedBundleIds()
      .map((bundleId) => state.apps.find((app) => app.bundleId === bundleId))
      .filter(Boolean);

    if (!selectedApps.length) {
      els.selectedAppsPreview.innerHTML = "全部 App";
    } else {
      els.selectedAppsPreview.innerHTML = selectedApps.slice(0, 3).map((app) => `
        <span class="selected-app-chip">
          ${app.artworkUrl ? `<img src="${escapeHtml(app.artworkUrl)}" alt="">` : `<span class="tiny-placeholder">${escapeHtml(appInitial(app))}</span>`}
          ${escapeHtml(app.trackName || app.bundleId)}
        </span>
      `).join("") + (selectedApps.length > 3 ? `<span class="selected-count">+${selectedApps.length - 3}</span>` : "");
    }

    els.clearAppSelection.classList.toggle("is-selected", !selectedApps.length);
    els.appOptions.querySelectorAll(".app-option").forEach((option) => {
      const isSelected = state.selectedBundleIds.has(option.dataset.bundleId);
      option.classList.toggle("is-selected", isSelected);
      option.querySelector(".app-check").textContent = isSelected ? "✓" : "";
    });
  }

  function updateCountryOptions() {
    const selected = els.countrySelect.value;
    state.countries = new Set(state.users.map((user) => user.storefront).filter(Boolean));
    els.countrySelect.innerHTML = `<option value="">全部国家</option>`;

    [...state.countries].sort().forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = country;
      els.countrySelect.appendChild(option);
    });

    if ([...state.countries].includes(selected)) els.countrySelect.value = selected;
    syncEnhancedSelect(els.countrySelect);
  }

  function render() {
    const country = els.countrySelect.value;
    state.filteredUsers = country
      ? state.users.filter((user) => user.storefront === country)
      : [...state.users];
    state.dailyRows = buildDailyRows();

    renderSummary();
    renderDailySummary();
  }

  function renderSummary() {
    const totals = aggregateRows(state.dailyRows);
    const cpa = totals.spend > 0 && totals.subscribe ? totals.spend / totals.subscribe : null;
    const paidCpa = totals.spend > 0 && totals.paid ? totals.spend / totals.paid : null;
    const retention = totals.paid ? totals.activePaid / totals.paid : null;
    const profit = totals.income - totals.spend;
    const roi = totals.spend > 0 ? totals.income / totals.spend : null;

    els.metricUsers.textContent = formatInteger(totals.subscribe);
    els.metricPaidUsers.textContent = formatInteger(totals.paid);
    els.metricCanceledUsers.textContent = formatInteger(totals.canceled);
    els.metricRefundUsers.textContent = formatInteger(totals.refund);
    els.metricActivePaidUsers.textContent = formatInteger(totals.activePaid);
    els.metricRetention.textContent = formatRate(retention);
    els.metricCpa.textContent = formatOptionalUSD(cpa);
    els.metricPaidCpa.textContent = formatOptionalUSD(paidCpa);
    els.metricProfit.textContent = formatUSD(profit);
    els.metricSpend.textContent = formatUSD(totals.spend);
    els.metricIncome.textContent = formatUSD(totals.income);
    els.metricRoi.textContent = formatRoi(roi);
    els.metricSpendSource.textContent = totals.savedSpendCount
      ? `已录入 ${totals.savedSpendCount} 天投入`
      : "未录入投入";
  }

  function buildDailyRows() {
    return datesInRange().reverse().map((date) => {
      const users = state.filteredUsers.filter((user) => user.day === date);
      const subscribe = users.length;
      const canceled = users.filter((user) => Boolean(user.cancelDate)).length;
      const paid = users.filter((user) => user.isCharged).length;
      const activePaid = users.filter((user) => user.status === "续订成功").length;
      const refund = users.filter((user) => user.hasRefund).length;
      const income = sum(users, (user) => user.income);
      const spendInfo = spendForDate(date);
      const cpa = spendInfo.saved && subscribe ? spendInfo.usd / subscribe : null;
      const paidCpa = spendInfo.saved && paid ? spendInfo.usd / paid : null;
      const roi = spendInfo.usd > 0 ? income / spendInfo.usd : null;

      return {
        date,
        users,
        subscribe,
        canceled,
        paid,
        activePaid,
        refund,
        cpa,
        paidCpa,
        roi,
        income,
        spend: spendInfo.usd,
        spendInput: spendInfo.amount,
        spendCurrency: spendInfo.currency,
        spendSaved: spendInfo.saved,
      };
    });
  }

  function renderDailySummary() {
    if (!state.dailyRows.length) {
      els.dailySummaryTable.innerHTML = `<tr><td colspan="11" class="empty-cell">暂无数据</td></tr>`;
      return;
    }

    const canRecordSpend = selectedBundleIds().length === 1;
    els.dailySummaryTable.innerHTML = state.dailyRows.map((row) => `
      <tr class="${row.spend > 0 || row.income > 0 ? "has-data" : ""}">
        <td class="mono">${row.date}</td>
        <td>${formatInteger(row.subscribe)}</td>
        <td>${formatInteger(row.canceled)}</td>
        <td>${formatInteger(row.paid)}</td>
        ${isEditor() ? "" : `<td>${formatInteger(row.refund)}</td>`}
        ${isEditor() ? "" : `<td>${formatInteger(row.activePaid)}</td>`}
        <td>${formatOptionalUSD(row.cpa)}</td>
        <td>${formatOptionalUSD(row.paidCpa)}</td>
        ${isEditor() ? "" : `<td>${formatRoi(row.roi)}</td>`}
        ${isEditor() ? "" : `<td>${formatUSD(row.income)}</td>`}
        <td>
          <div class="spend-cell">
            <strong>${row.spendInput ? formatUSD(row.spend) : "-"}</strong>
            <button class="tiny-action-button" type="button" data-expense-date="${row.date}" ${canRecordSpend ? "" : "disabled"}>
              ${row.spendSaved ? "修改" : "录入"}
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function handleDailySpendClick(event) {
    const button = event.target.closest("[data-expense-date]");
    if (!button || button.disabled) return;
    openExpenseModal(button.dataset.expenseDate);
  }

  function openExpenseModal(date) {
    const bundleIds = selectedBundleIds();
    if (bundleIds.length !== 1) {
      setStatus("只能在单选一个 App 后录入投入");
      return;
    }

    const saved = expenseForDateAndProject(date, bundleIds[0]);
    state.editingExpenseId = saved?.id || "";
    state.editingExpenseDate = date;
    state.editingExpenseProjectId = bundleIds[0];
    state.editingExpenseUser = saved?.user || currentExpenseUser();
    els.expenseAmount.value = saved ? formatExpenseInputAmount(saved) : "";
    els.expenseCurrency.value = normalizeCurrency(saved?.currency || DEFAULT_CURRENCY);
    els.expenseStorefront.value = saved?.storefront || DEFAULT_STORE_FRONT;
    els.expenseAdPlatform.value = normalizeAdPlatform(saved?.adPlatform || DEFAULT_AD_PLATFORM);
    syncEnhancedSelect(els.expenseCurrency);
    syncEnhancedSelect(els.expenseStorefront);
    syncEnhancedSelect(els.expenseAdPlatform);
    updateExpensePreview();
    els.expenseModal.hidden = false;
    els.expenseAmount.focus();
  }

  function closeExpenseModal() {
    els.expenseModal.hidden = true;
    els.expenseForm.reset();
    state.editingExpenseId = "";
    state.editingExpenseDate = "";
    state.editingExpenseProjectId = "";
    state.editingExpenseUser = "";
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    const bundleIds = selectedBundleIds();

    if (bundleIds.length !== 1) {
      setStatus("只能在单选一个 App 后录入投入");
      closeExpenseModal();
      return;
    }

    const expense = expenseFromForm();
    if (!expense) {
      setStatus("投入参数没有填完整");
      return;
    }

    setBusy(true);
    setStatus(state.editingExpenseId ? "正在修改投入..." : "正在录入投入...");

    try {
      const savedExpense = state.editingExpenseId
        ? await request(`/daily-expense/${state.editingExpenseId}`, {
          method: "PUT",
          body: JSON.stringify(expense),
        })
        : await request("/daily-expense", {
          method: "POST",
          body: JSON.stringify(expense),
        });

      upsertExpense(normalizeExpense(savedExpense));
      state.dailyRows = buildDailyRows();
      renderSummary();
      renderDailySummary();
      closeExpenseModal();
      setStatus("投入已保存到服务端");
    } catch (error) {
      setStatus(`投入保存失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function expenseFromForm() {
    const amount = numeric(els.expenseAmount.value);
    const requiredValues = [
      els.expenseCurrency.value,
      els.expenseStorefront.value,
      els.expenseAdPlatform.value,
      state.editingExpenseDate,
      state.editingExpenseProjectId,
      state.editingExpenseUser,
    ];

    if (!requiredValues.every((value) => String(value).trim()) || amount <= 0) return null;

    return {
      user: state.editingExpenseUser || currentExpenseUser(),
      date: `${state.editingExpenseDate}T00:00:00Z`,
      amount: Math.round(amount * 1000),
      currency: normalizeCurrency(els.expenseCurrency.value),
      storefront: els.expenseStorefront.value,
      adPlatform: normalizeAdPlatform(els.expenseAdPlatform.value),
      projectID: state.editingExpenseProjectId,
    };
  }

  function updateExpensePreview() {
    const amount = numeric(els.expenseAmount.value);
    els.expensePreview.textContent = `保存为 ${formatInteger(Math.round(amount * 1000))}`;
  }

  function spendForDate(date) {
    const expenses = expensesForDate(date);
    const amount = sum(expenses, expenseDisplayAmount);
    const usd = sum(expenses, (expense) => convertToUSD(
      expenseDisplayAmount(expense),
      normalizeCurrency(expense.currency || DEFAULT_CURRENCY),
    ));

    return {
      amount,
      currency: DEFAULT_CURRENCY,
      usd,
      saved: expenses.length > 0,
    };
  }

  function expenseDisplayAmount(expense) {
    if (!expense) return 0;
    return numeric(expense.amount) / 1000;
  }

  function formatExpenseInputAmount(expense) {
    const amount = expenseDisplayAmount(expense);
    return amount ? String(amount) : "";
  }

  function expensesForDate(date) {
    const selected = selectedBundleIds();
    const selectedSet = new Set(selected);
    const country = els.countrySelect.value;

    return state.expenses
      .filter((expense) => {
        if (expenseDateString(expense) !== date) return false;
        if (country && expense.storefront !== country) return false;
        if (!selected.length) return true;
        return selectedSet.has(expense.projectID);
      });
  }

  function expenseForDateAndProject(date, projectID) {
    const country = els.countrySelect.value;
    const expenses = state.expenses
      .filter((expense) => {
        if (expenseDateString(expense) !== date) return false;
        if (expense.projectID !== projectID) return false;
        return true;
      });

    return expenses.find((expense) => !country || expense.storefront === country)
      || expenses.find((expense) => expense.storefront === DEFAULT_STORE_FRONT)
      || expenses[0]
      || null;
  }

  function expenseDateString(expense) {
    if (expense?.date && /^\d{4}-\d{2}-\d{2}$/.test(expense.date)) return expense.date;
    return String(expense?.date || "").slice(0, 10);
  }

  function setDefaultRange() {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    els.startDateInput.value = toDateInputValue(start);
    els.endDateInput.value = toDateInputValue(end);
  }

  function normalizeDateRange() {
    if (
      els.startDateInput.value
      && els.endDateInput.value
      && new Date(els.startDateInput.value) > new Date(els.endDateInput.value)
    ) {
      const start = els.endDateInput.value;
      els.endDateInput.value = els.startDateInput.value;
      els.startDateInput.value = start;
    }
  }

  function shiftRange(direction) {
    normalizeDateRange();

    const base = els.startDateInput.value
      ? parseDateInput(els.startDateInput.value)
      : els.endDateInput.value
        ? parseDateInput(els.endDateInput.value)
        : new Date();
    const target = new Date(base.getFullYear(), base.getMonth() + direction, 1);
    const start = new Date(target.getFullYear(), target.getMonth(), 1);
    const end = new Date(target.getFullYear(), target.getMonth() + 1, 0);

    els.startDateInput.value = toDateInputValue(start);
    els.endDateInput.value = toDateInputValue(end);
    loadUsers();
  }

  function rangeBounds() {
    normalizeDateRange();

    const startDate = els.startDateInput.value ? parseDateInput(els.startDateInput.value) : null;
    const endDate = els.endDateInput.value ? parseDateInput(els.endDateInput.value) : null;
    if (endDate) endDate.setDate(endDate.getDate() + 1);

    return {
      start: startDate ? startDate.getTime() : null,
      end: endDate ? endDate.getTime() - 1 : null,
    };
  }

  function datesInRange() {
    normalizeDateRange();
    const startValue = els.startDateInput.value;
    const endValue = els.endDateInput.value;
    const dates = [];

    if (startValue && endValue) {
      const cursor = parseDateInput(startValue);
      const end = parseDateInput(endValue);

      while (cursor <= end) {
        dates.push(toDateInputValue(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }

      return dates;
    }

    const startTime = startValue ? parseDateInput(startValue).getTime() : null;
    const endTime = endValue ? parseDateInput(endValue).getTime() : null;

    const knownDates = new Set([
      ...state.filteredUsers.map((user) => user.day),
      ...state.expenses.map(expenseDateString),
    ].filter(Boolean));

    return [...knownDates]
      .filter((date) => {
        const time = parseDateInput(date).getTime();
        return (startTime === null || time >= startTime)
          && (endTime === null || time <= endTime);
      })
      .sort();
  }

  function normalizeUsers(users) {
    return users.map((user) => {
      const rawIncome = numeric(user.income);
      const currency = normalizeCurrency(user.currency || DEFAULT_CURRENCY);

      return {
        ...user,
        rawIncome,
        income: normalizeIncomeToUSD(rawIncome, currency),
        isCharged: Boolean(user.isCharged),
        currency,
        transactionCount: numeric(user.transactionCount),
        date: numeric(user.date),
        cancelDate: numeric(user.cancelDate),
        hasRefund: Boolean(user.hasRefund),
        day: toDateInputValue(new Date(numeric(user.date))),
      };
    });
  }

  function normalizeExpenses(expenses) {
    return expenses.map(normalizeExpense).filter(Boolean);
  }

  function normalizeExpense(expense) {
    if (!expense) return null;

    return {
      ...expense,
      id: expense.id || "",
      date: expenseDateString(expense),
      amount: numeric(expense.amount),
      currency: normalizeCurrency(expense.currency || DEFAULT_CURRENCY),
      storefront: expense.storefront || "",
      adPlatform: expense.adPlatform || "",
      projectID: expense.projectID || "",
    };
  }

  function upsertExpense(expense) {
    if (!expense) return;

    state.expenses = state.expenses.filter((item) => {
      if (expense.id && item.id === expense.id) return false;
      return !(expenseDateString(item) === expenseDateString(expense)
        && item.projectID === expense.projectID
        && item.storefront === expense.storefront);
    });
    state.expenses.push(expense);
  }

  function aggregateRows(rows) {
    return rows.reduce((totals, row) => {
      totals.subscribe += row.subscribe;
      totals.canceled += row.canceled;
      totals.paid += row.paid;
      totals.activePaid += row.activePaid;
      totals.refund += row.refund;
      totals.income += row.income;
      totals.spend += row.spend;
      totals.savedSpendCount += row.spendSaved ? 1 : 0;
      return totals;
    }, {
      subscribe: 0,
      canceled: 0,
      paid: 0,
      activePaid: 0,
      refund: 0,
      income: 0,
      spend: 0,
      savedSpendCount: 0,
    });
  }

  function selectedBundleIds() {
    return [...state.selectedBundleIds].sort();
  }

  function appInitial(app) {
    return (app.trackName || app.bundleId || "A").slice(0, 1).toUpperCase();
  }

  function toggleAppPicker() {
    const isOpen = els.appPickerMenu.hidden;
    els.appPickerMenu.hidden = !isOpen;
    els.appPickerButton.setAttribute("aria-expanded", String(isOpen));
  }

  function closeAppPickerOnOutsideClick(event) {
    if (els.appPicker.contains(event.target)) return;
    els.appPickerMenu.hidden = true;
    els.appPickerButton.setAttribute("aria-expanded", "false");
  }

  function enhanceSelects() {
    document.querySelectorAll("select").forEach(enhanceSelect);
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.enhancedSelect === "true") {
      syncEnhancedSelect(select);
      return;
    }

    const shell = document.createElement("div");
    shell.className = "select-shell";
    shell.dataset.selectShell = select.id || "";

    const trigger = document.createElement("button");
    trigger.className = "select-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `
      <span class="select-value"></span>
      <span class="select-indicator" aria-hidden="true">⌄</span>
    `;

    const menu = document.createElement("div");
    menu.className = "select-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");

    shell.append(trigger, menu);
    select.insertAdjacentElement("afterend", shell);
    select.dataset.enhancedSelect = "true";
    select.tabIndex = -1;

    trigger.addEventListener("click", () => toggleCustomSelect(select));
    select.addEventListener("change", () => syncEnhancedSelect(select));
    syncEnhancedSelect(select);
  }

  function syncEnhancedSelect(select) {
    if (!select) return;

    const shell = select.nextElementSibling?.classList?.contains("select-shell")
      ? select.nextElementSibling
      : null;
    if (!shell) {
      if (select.dataset.enhancedSelect === "true") select.dataset.enhancedSelect = "";
      enhanceSelect(select);
      return;
    }

    const trigger = shell.querySelector(".select-trigger");
    const value = shell.querySelector(".select-value");
    const menu = shell.querySelector(".select-menu");
    const selectedOption = select.options[select.selectedIndex] || select.options[0];

    value.textContent = selectedOption?.textContent || "请选择";
    menu.innerHTML = "";

    [...select.options].forEach((option) => {
      const item = document.createElement("button");
      item.className = "select-option";
      item.type = "button";
      item.role = "option";
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.setAttribute("aria-selected", String(option.selected));
      item.classList.toggle("is-selected", option.selected);
      item.addEventListener("click", () => {
        select.value = option.value;
        closeCustomSelect(select);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      menu.appendChild(item);
    });

    trigger.disabled = select.disabled;
  }

  function toggleCustomSelect(select) {
    const shell = select.nextElementSibling;
    const menu = shell.querySelector(".select-menu");
    const trigger = shell.querySelector(".select-trigger");
    const shouldOpen = menu.hidden;

    closeAllCustomSelects(select);
    menu.hidden = !shouldOpen;
    shell.classList.toggle("is-open", shouldOpen);
    trigger.setAttribute("aria-expanded", String(shouldOpen));
  }

  function closeCustomSelect(select) {
    const shell = select?.nextElementSibling;
    if (!shell?.classList?.contains("select-shell")) return;

    const menu = shell.querySelector(".select-menu");
    const trigger = shell.querySelector(".select-trigger");
    menu.hidden = true;
    shell.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function closeAllCustomSelects(exceptSelect) {
    document.querySelectorAll("select[data-enhanced-select='true']").forEach((select) => {
      if (select !== exceptSelect) closeCustomSelect(select);
    });
  }

  function closeCustomSelectsOnOutsideClick(event) {
    if (event.target.closest(".select-shell")) return;
    closeAllCustomSelects();
  }

  function closeCustomSelectsOnEscape(event) {
    if (event.key === "Escape") closeAllCustomSelects();
  }

  function setAuthenticated(token, user) {
    state.authToken = token;
    state.currentUser = user;
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    renderSession();
  }

  function clearAuth() {
    state.authToken = "";
    state.currentUser = null;
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    renderSession();
  }

  function isAuthenticated() {
    return Boolean(state.authToken);
  }

  function requireLogin(message) {
    resetDashboardData();
    renderSession();
    openLoginModal(message);
    setStatus(message);
  }

  function openLoginModal(message) {
    els.loginApiBase.value = els.apiBase.value;
    els.loginModal.hidden = false;
    showLoginError(message);
    window.requestAnimationFrame(() => els.loginApiBase.focus());
  }

  function closeLoginModal() {
    els.loginModal.hidden = true;
    showLoginError("");
  }

  function renderSession() {
    renderApiControl();

    if (!state.authToken || !state.currentUser) {
      els.sessionCard.hidden = true;
      document.body.classList.remove("role-editor");
      return;
    }

    els.sessionCard.hidden = false;
    els.currentUserName.textContent = state.currentUser.username || "已登录";
    els.currentUserRole.textContent = state.currentUser.role || "-";
    document.body.classList.toggle("role-editor", isEditor());
  }

  function renderApiControl() {
    const locked = isAuthenticated();
    els.apiBase.parentElement.hidden = locked;
    els.apiReadonly.hidden = !locked;
    els.apiReadonlyValue.textContent = cleanApiBase() || "-";
  }

  function resetDashboardData() {
    state.apps = [];
    state.users = [];
    state.filteredUsers = [];
    state.dailyRows = [];
    state.expenses = [];
    state.countries = new Set();
    state.selectedBundleIds.clear();
    updateCountryOptions();
    renderApps();
    render();
    els.lastUpdated.textContent = "-";
  }

  function showLoginError(message) {
    els.loginError.hidden = !message;
    els.loginError.textContent = message || "";
  }

  function setLoginBusy(isBusy) {
    els.loginSubmitButton.disabled = isBusy;
    els.loginSubmitButton.textContent = isBusy ? "登录中..." : "登录";
  }

  function normalizeAuthUser(user) {
    const payload = user?.user || user || {};
    return {
      id: payload.id || "",
      username: payload.username || "",
      role: payload.role || "",
    };
  }

  function readStoredUser() {
    try {
      const user = JSON.parse(localStorage.getItem(AUTH_USER_STORAGE_KEY) || "null");
      return user ? normalizeAuthUser(user) : null;
    } catch {
      return null;
    }
  }

  function currentExpenseUser() {
    return state.currentUser?.username || DEFAULT_EXPENSE_USER;
  }

  function isEditor() {
    return state.currentUser?.role === "editor";
  }

  function applyApiBase(value) {
    const apiBase = String(value || "").trim().replace(/\/+$/, "");
    if (!apiBase) return;

    els.apiBase.value = apiBase;
    els.loginApiBase.value = apiBase;
    els.apiReadonlyValue.textContent = apiBase;
    localStorage.setItem(API_BASE_STORAGE_KEY, apiBase);
  }

  function cleanApiBase() {
    return els.apiBase.value.replace(/\/+$/, "");
  }

  function setBusy(isBusy) {
    els.reloadButton.disabled = isBusy;
    els.reloadButton.textContent = isBusy ? "加载中..." : "刷新数据";
  }

  function setStatus(text) {
    els.statusText.textContent = text;
  }

  function todayString() {
    return toDateInputValue(new Date());
  }

  function parseDateInput(value) {
    return new Date(`${value}T00:00:00`);
  }

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatInteger(value) {
    return new Intl.NumberFormat().format(numeric(value));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric(value));
  }

  function formatUSD(value) {
    return `$${formatNumber(value)}`;
  }

  function formatOptionalUSD(value) {
    return value === null ? "-" : formatUSD(value);
  }

  function formatRoi(value) {
    if (value === null) return "-";
    return formatRate(value);
  }

  function formatRate(value) {
    if (value === null) return "-";
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value * 100)}%`;
  }

  function numeric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function sum(items, getValue) {
    return items.reduce((total, item) => total + numeric(getValue(item)), 0);
  }

  function normalizeIncomeToUSD(rawIncome, currency) {
    return convertToUSD((rawIncome / 1000) * 0.85, currency);
  }

  function convertToUSD(amount, currency) {
    const code = normalizeCurrency(currency);
    if (!amount || code === DEFAULT_CURRENCY) return numeric(amount);

    const rate = numeric(state.exchangeRates[code]);
    return rate > 0 ? numeric(amount) / rate : numeric(amount);
  }

  function normalizeCurrency(currency) {
    return String(currency || DEFAULT_CURRENCY).trim().toUpperCase();
  }

  function normalizeAdPlatform(adPlatform) {
    return ["Google", "Meta"].includes(adPlatform) ? adPlatform : DEFAULT_AD_PLATFORM;
  }

  function readExchangeRateCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY) || "null");
      const maxAge = 12 * 60 * 60 * 1000;
      if (!cached?.rates || Date.now() - numeric(cached.updatedAt) > maxAge) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function loadCachedExchangeRates() {
    return readExchangeRateCache()?.rates || { [DEFAULT_CURRENCY]: 1 };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
