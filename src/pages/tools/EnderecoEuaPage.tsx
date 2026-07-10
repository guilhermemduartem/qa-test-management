/* ═══════════════════════════════════════════════════════════
   EnderecoEuaPage — consulta dados de endereço nos EUA a partir
   de um ZIP Code (zippopotam.us + Nominatim/OpenStreetMap).
   ═══════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { ToolLayout } from '../../components/tools/ToolLayout';
import { CopyButton } from '../../components/tools/CopyButton';
import { consultarEnderecoEUA, type EnderecoEUA } from '../../lib/toolUtils';

export function EnderecoEuaPage() {
  const [zip, setZip] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<EnderecoEUA | null>(null);

  const consultar = async () => {
    const value = zip.trim();
    if (!value) { setErro('Por favor, digite um ZIP Code.'); setDados(null); return; }
    setLoading(true);
    setErro('');
    setDados(null);
    const result = await consultarEnderecoEUA(value);
    setLoading(false);
    if (result.success) setDados(result.data);
    else setErro(result.error);
  };

  const campos: [string, string][] = dados
    ? [
        ['ZIP Code', dados.zipCode],
        ['País', `${dados.country} (${dados.countryAbbr})`],
        ['Cidade', dados.placeName],
        ['Estado', `${dados.state} (${dados.stateAbbr})`],
        ['Bairro', dados.neighbourhood],
        ['Rua', dados.road],
        ['Subúrbio', dados.suburb],
        ['Condado', dados.county],
        ['Latitude', dados.latitude],
        ['Longitude', dados.longitude],
        ['Endereço Completo', dados.displayName],
      ]
    : [];

  return (
    <ToolLayout
      title="Consulta de Endereço EUA"
      activeTool="endereco"
      help={
        <>
          <strong>Como usar esta tela</strong>
          <ul>
            <li>Informe um ZIP Code dos Estados Unidos.</li>
            <li>Clique em consultar ou pressione Enter.</li>
            <li>Confira cidade, estado, coordenadas e endereço completo.</li>
          </ul>
        </>
      }
    >
      <div className="tool-card cnpj-hero-card cnpj-block">
        <div className="cnpj-hero">
          <div>
            <h2>Consulta de endereço nos EUA</h2>
            <p>Busque cidade, estado, coordenadas e endereço completo a partir de um ZIP Code.</p>
          </div>
        </div>
      </div>

      <div className="tool-card cnpj-block">
        <div className="cnpj-filters cnpj-filters--address">
          <div className="filter-field cnpj-filter-with-action">
            <label>ZIP Code</label>
            <div className="cnpj-field-action-row">
              <input
                className="col-filter"
                type="text"
                value={zip}
                placeholder="Ex.: 90210"
                autoComplete="postal-code"
                onChange={(e) => setZip(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') consultar(); }}
              />
              <button className="btn btn-primary btn-sm cnpj-primary-action" onClick={consultar} disabled={loading}>
                {loading ? 'Consultando…' : 'Consultar'}
              </button>
            </div>
          </div>
        </div>

        {erro && <p className="tool-status is-error">{erro}</p>}
      </div>

      {dados && (
        <div className="tool-card cnpj-block">
          <div className="tool-section-head">
            <span>Resultado</span>
          </div>
          <div className="tool-kv-grid">
            {campos.map(([rotulo, valor]) => {
              const fieldValue = valor ? String(valor).trim() : '—';
              return (
                <div className="tool-kv" key={rotulo}>
                  <div className="tool-kv-header">
                    <span className="tool-kv-key">{rotulo}</span>
                    <CopyButton value={fieldValue} label="Copiar" className="btn btn-ghost btn-xs" />
                  </div>
                  <span className="tool-kv-val">{fieldValue}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
