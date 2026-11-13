/** Agency credit shown in the store footer, the login screen and the account/admin sidebars. */
export function DevCredit({ className = '' }: { className?: string }) {
  return (
    <p className={('dev-credit ' + className).trim()}>
      Desenvolvido por{' '}
      <a href="https://axxify.com" target="_blank" rel="noopener">
        Axxify
      </a>
    </p>
  );
}
