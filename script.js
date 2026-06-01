const header = document.querySelector('[data-header]');
const navToggle = document.querySelector('.nav-toggle');
const year = document.querySelector('[data-year]');

if (year) {
  year.textContent = new Date().getFullYear();
}

const setHeaderState = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 12);
};

setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

navToggle?.addEventListener('click', () => {
  const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isOpen));
  header?.classList.toggle('is-open', !isOpen);
});

document.querySelectorAll('.site-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    navToggle?.setAttribute('aria-expanded', 'false');
    header?.classList.remove('is-open');
  });
});
