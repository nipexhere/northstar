const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item[data-view]');
const pageTitle = document.querySelector('#page-title');
const modal = document.querySelector('#deposit-modal');
const toast = document.querySelector('#toast');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showView(viewName) {
  views.forEach((view) => view.classList.toggle('active-view', view.id === `${viewName}-view`));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  const activeItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  pageTitle.textContent = activeItem ? activeItem.textContent.trim().replace(/\d+$/, '') : 'Overview';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshIcons();
}

function openDepositModal() {
  modal.classList.add('open');
  document.querySelector('#deposit-amount').focus();
}

function closeDepositModal() {
  modal.classList.remove('open');
}

function showToast(message) {
  toast.querySelector('span').textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3800);
}

navItems.forEach((item) => item.addEventListener('click', () => {
  const view = item.id === 'admin-nav' ? 'admin' : item.dataset.view;
  showView(view);
}));

document.querySelectorAll('[data-view-target]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.viewTarget));
});

document.querySelectorAll('[data-open-deposit]').forEach((button) => button.addEventListener('click', openDepositModal));
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeDepositModal));
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeDepositModal();
});

document.querySelector('#deposit-sent').addEventListener('click', () => {
  const amount = Number(document.querySelector('#deposit-amount').value || 0);
  if (amount < 10) {
    showToast('Enter a deposit amount of at least $10.');
    return;
  }
  closeDepositModal();
  showToast('Deposit submitted for review.');
});

document.querySelectorAll('[data-subscribe]').forEach((button) => button.addEventListener('click', () => {
  showToast(`${button.dataset.subscribe} is ready when your funds are available.`);
}));

document.querySelector('#withdraw-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showToast('Withdrawal request sent to the review queue.');
  event.target.reset();
});

document.querySelectorAll('.confirm-deposit').forEach((button) => button.addEventListener('click', () => {
  const row = button.closest('[data-review]');
  row.classList.add('reviewed');
  row.removeAttribute('data-review');
  button.remove();
  row.querySelector('.pending-tag').className = 'tag confirmed-tag';
  row.querySelector('.pending-tag').textContent = 'Confirmed';
  const label = document.createElement('span');
  label.className = 'reviewed-label';
  label.textContent = 'Reviewed';
  row.appendChild(label);
  const pending = document.querySelectorAll('[data-review]').length;
  document.querySelector('#pending-count').textContent = pending;
  showToast('Deposit confirmed and user notified.');
  refreshIcons();
}));

document.querySelector('#mark-all').addEventListener('click', () => {
  document.querySelectorAll('.confirm-deposit').forEach((button) => button.click());
});

document.querySelector('#notification-button').addEventListener('click', () => showToast('2 notifications: one deposit is awaiting review.'));

refreshIcons();
