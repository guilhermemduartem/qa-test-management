/* Placeholder temporário para telas do módulo de Testes ainda
   não implementadas (preenchidas nas próximas etapas). */
import { TestsLayout } from './TestsLayout';
import type { TestKey } from '../../components/Sidebar';

export function TestsPlaceholder({ title, activeTest }: { title: string; activeTest: TestKey }) {
  return (
    <TestsLayout title={title} activeTest={activeTest}>
      <div className="tests-empty">
        <h2>{title}</h2>
        <p>Esta tela faz parte do módulo de Gestão de Testes e será disponibilizada em breve.</p>
      </div>
    </TestsLayout>
  );
}
