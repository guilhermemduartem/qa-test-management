/* ═══════════════════════════════════════════════════════════
   CollectionPage — Motor de Busca: gera uma Collection Postman
   para o fluxo de DynamicPackage a partir de cenários (origem/
   destino), quartos e ocupação (adultos/crianças), respeitando
   o limite global de 10 pessoas por cenário.
   ═══════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { showToast } from '../../lib/toast';
import { downloadText } from '../../lib/toolUtils';
import {
  LIMITE_PESSOAS, buildCollection, collectionTimestamp,
  type Scenario, type Quarto,
} from '../../lib/postmanCollection';

interface UIRoom {
  adt: number;
  chd: number;
  chdAges: (number | '')[];
}
interface UIScenario {
  id: number;
  nome: string;
  origem: string;
  destino: string;
  quartos: UIRoom[];
}

const novoQuarto = (): UIRoom => ({ adt: 1, chd: 0, chdAges: [] });
const novoCenario = (id: number): UIScenario => ({ id, nome: '', origem: '', destino: '', quartos: [novoQuarto()] });

const totalPessoas = (s: UIScenario) => s.quartos.reduce((t, q) => t + q.adt + q.chd, 0);

/** Pessoas usadas pelos demais quartos (exclui o quarto `ri`). */
const usadasPorOutros = (s: UIScenario, ri: number) =>
  totalPessoas(s) - (s.quartos[ri].adt + s.quartos[ri].chd);

const maxAdultos = (s: UIScenario, ri: number) => Math.max(1, LIMITE_PESSOAS - usadasPorOutros(s, ri));
const maxCriancas = (s: UIScenario, ri: number) =>
  Math.max(0, LIMITE_PESSOAS - usadasPorOutros(s, ri) - s.quartos[ri].adt);

export function CollectionPage() {
  const [scenarios, setScenarios] = useState<UIScenario[]>([novoCenario(1)]);
  const [nextId, setNextId] = useState(2);
  const [email, setEmail] = useState('rafael@coloque.email');
  const [senha, setSenha] = useState('coloqueseusenha');
  const [status, setStatus] = useState('');

  const updateScenario = (id: number, fn: (s: UIScenario) => UIScenario) =>
    setScenarios((prev) => prev.map((s) => (s.id === id ? fn(s) : s)));

  const updateRoom = (id: number, ri: number, fn: (q: UIRoom) => UIRoom) =>
    updateScenario(id, (s) => ({ ...s, quartos: s.quartos.map((q, i) => (i === ri ? fn(q) : q)) }));

  /* ── Cenários ── */
  const addScenario = () => {
    const ultimo = scenarios[scenarios.length - 1];
    if (ultimo && (!ultimo.nome.trim() || !ultimo.origem.trim() || !ultimo.destino.trim())) {
      showToast('Preencha Nome, Origem e Destino do cenário atual antes de adicionar outro.', 'warning');
      return;
    }
    setScenarios((prev) => [...prev, novoCenario(nextId)]);
    setNextId((n) => n + 1);
  };

  const removeScenario = (id: number) =>
    setScenarios((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));

  /* ── Quartos ── */
  const addRoom = (id: number) => {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    if (LIMITE_PESSOAS - totalPessoas(s) <= 0) {
      showToast('Limite de 10 pessoas atingido. Não é possível adicionar mais quartos.', 'warning');
      return;
    }
    updateScenario(id, (sc) => ({ ...sc, quartos: [...sc.quartos, novoQuarto()] }));
  };

  const removeRoom = (id: number, ri: number) =>
    updateScenario(id, (s) => (s.quartos.length > 1 ? { ...s, quartos: s.quartos.filter((_, i) => i !== ri) } : s));

  const setAdultos = (id: number, ri: number, value: number) =>
    updateScenario(id, (s) => {
      const outros = usadasPorOutros(s, ri);
      const adt = Math.min(Math.max(1, value), LIMITE_PESSOAS - outros);
      const chdMax = Math.max(0, LIMITE_PESSOAS - outros - adt);
      const q = s.quartos[ri];
      const chd = Math.min(q.chd, chdMax);
      const chdAges = q.chdAges.slice(0, chd);
      while (chdAges.length < chd) chdAges.push('');
      return { ...s, quartos: s.quartos.map((qq, i) => (i === ri ? { adt, chd, chdAges } : qq)) };
    });

  const setCriancas = (id: number, ri: number, value: number) =>
    updateRoom(id, ri, (q) => {
      const chd = Math.max(0, value);
      const chdAges = q.chdAges.slice(0, chd);
      while (chdAges.length < chd) chdAges.push('');
      return { ...q, chd, chdAges };
    });

  const setIdade = (id: number, ri: number, ci: number, raw: string) =>
    updateRoom(id, ri, (q) => {
      const chdAges = [...q.chdAges];
      chdAges[ci] = raw === '' ? '' : Number(raw);
      return { ...q, chdAges };
    });

  /* ── Geração ── */
  const gerar = () => {
    if (scenarios.length === 0) {
      showToast('Não há cenários para gerar a coleção!', 'error');
      return;
    }
    const erros: string[] = [];
    scenarios.forEach((s, i) => {
      if (!s.nome.trim() || !s.origem.trim() || !s.destino.trim()) {
        erros.push(`Cenário ${i + 1}: Nome, Origem e Destino são obrigatórios.`);
      }
      if (s.quartos.length === 0) erros.push(`Cenário ${i + 1}: deve ter pelo menos um quarto.`);
      s.quartos.forEach((q, qi) => {
        q.chdAges.forEach((idade, ai) => {
          if (idade === '' || Number.isNaN(Number(idade)) || Number(idade) < 0 || Number(idade) > 17) {
            erros.push(`Cenário ${i + 1}, Quarto ${qi + 1}, Criança ${ai + 1}: idade inválida (deve ser 0–17).`);
          }
        });
      });
    });

    if (erros.length > 0) {
      showToast(erros.join(' '), 'error', 6000);
      setStatus('');
      return;
    }

    const limpos: Scenario[] = scenarios.map((s) => ({
      nome: s.nome.trim(),
      origem: s.origem.trim(),
      destino: s.destino.trim(),
      quartos: s.quartos.map<Quarto>((q) => ({ adt: q.adt, chd: q.chd, chdAges: q.chdAges.map((a) => Number(a)) })),
    }));

    const ts = collectionTimestamp();
    const collection = buildCollection(limpos, email.trim() || 'rafael@coloque.email', senha.trim() || 'coloqueseusenha', ts);
    downloadText(`DynamicPackage_Full_Flow_${ts}.json`, JSON.stringify(collection, null, 2), 'application/json');
    setStatus('Collection Postman gerada com sucesso!');
    showToast('Collection gerada e baixada.', 'success');
  };

  return (
    <ToolLayout
      title="Motor de Busca"
      activeTool="collection"
      help={
        <>
          <strong>Como usar esta ferramenta</strong>
          <ul>
            <li>Crie um cenário com nome, origem e destino.</li>
            <li>Adicione quartos e defina adultos/crianças com idades.</li>
            <li>Gere a Collection e importe no Postman para testar o fluxo DynamicPackage.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>Motor de Busca</h2>
            <p>Monte cenários de reserva e gere uma Collection Postman completa do fluxo DynamicPackage.</p>
          </div>
        </div>
      </div>

      {scenarios.map((s, idx) => {
        const total = totalPessoas(s);
        return (
          <div className="tool-card mb-card" key={s.id}>
            <div className="mb-cenario-header">
              <h3>Cenário {idx + 1}</h3>
              <div className="mb-cenario-meta">
                <span className="mb-pill">{total}/{LIMITE_PESSOAS} pessoas</span>
                {scenarios.length > 1 && (
                  <button className="btn btn-danger btn-xs" onClick={() => removeScenario(s.id)}>Remover</button>
                )}
              </div>
            </div>

            <div className="tool-controls">
              <div className="form-group">
                <label>Nome do cenário</label>
                <input type="text" value={s.nome} placeholder="Ex.: Pacote SP → RJ"
                  onChange={(e) => updateScenario(s.id, (sc) => ({ ...sc, nome: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Origem (Id)</label>
                <input type="text" value={s.origem} placeholder="Ex.: 231"
                  onChange={(e) => updateScenario(s.id, (sc) => ({ ...sc, origem: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Destino (Id)</label>
                <input type="text" value={s.destino} placeholder="Ex.: 5088"
                  onChange={(e) => updateScenario(s.id, (sc) => ({ ...sc, destino: e.target.value }))} />
              </div>
            </div>

            <div className="mb-quartos">
              {s.quartos.map((q, ri) => {
                const adtMax = maxAdultos(s, ri);
                const chdMax = maxCriancas(s, ri);
                return (
                  <div className="mb-quarto" key={ri}>
                    <div className="mb-quarto-header">
                      <strong>Quarto {ri + 1}</strong>
                      {s.quartos.length > 1 && (
                        <button className="btn btn-ghost btn-xs" onClick={() => removeRoom(s.id, ri)}>✕</button>
                      )}
                    </div>
                    <div className="tool-controls">
                      <div className="form-group">
                        <label>Adultos</label>
                        <select value={q.adt} onChange={(e) => setAdultos(s.id, ri, Number(e.target.value))}>
                          {Array.from({ length: adtMax }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Crianças</label>
                        <select value={q.chd} onChange={(e) => setCriancas(s.id, ri, Number(e.target.value))}>
                          {Array.from({ length: chdMax + 1 }, (_, i) => i).map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {q.chd > 0 && (
                      <div className="mb-idades">
                        {Array.from({ length: q.chd }, (_, ci) => {
                          const val = q.chdAges[ci];
                          const invalido = val !== '' && (Number(val) < 0 || Number(val) > 17);
                          return (
                            <div className="form-group mb-idade" key={ci}>
                              <label>Criança {ci + 1}</label>
                              <input
                                type="number" min={0} max={17} placeholder="0-17"
                                className={invalido ? 'input-invalid' : ''}
                                value={val === '' ? '' : val}
                                onChange={(e) => setIdade(s.id, ri, ci, e.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              <button className="btn btn-ghost btn-sm" onClick={() => addRoom(s.id)} disabled={total >= LIMITE_PESSOAS}>
                + Adicionar Quarto
              </button>
            </div>
          </div>
        );
      })}

      <div className="tool-actions">
        <button className="btn btn-ghost" onClick={addScenario}>+ Adicionar Cenário</button>
      </div>

      <div className="tool-card mb-card">
        <h3 className="mb-section-title">Credenciais de Acesso</h3>
        <div className="tool-controls">
          <div className="form-group">
            <label>Email/Usuário</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Senha</label>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="tool-actions">
        <button className="btn btn-primary" onClick={gerar}>Gerar Collection Postman</button>
      </div>

      {status && <p className="tool-status is-ok">{status}</p>}
    </ToolLayout>
  );
}
