/* ═══════════════════════════════════════════════════════════
   MobileBlock — bloqueio de acesso por celular.
   Em telas pequenas (≤ 768px) cobre TODA a aplicação (inclusive
   a tela de login) com a arte de "Acesso exclusivo por computador".
   A visibilidade é 100% via CSS (@media), então não há janela em
   que o conteúdo por baixo fique acessível.
   ═══════════════════════════════════════════════════════════ */
export function MobileBlock() {
  return (
    <div className="mobile-block" role="dialog" aria-modal="true" aria-label="Acesso exclusivo por computador">
      <img
        src={`${import.meta.env.BASE_URL}opss.png`}
        alt="Ops! Parece que você está no celular. Acesso exclusivo por computador — utilize um computador ou notebook para acessar o sistema."
      />
    </div>
  );
}
