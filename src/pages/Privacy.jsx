import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, EyeOff, Trash2, Database, BarChart3 } from 'lucide-react';
import Footer from '../components/Footer';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="container">
      <header>
        <button className="btn btn-outline" style={{ border: 'none', padding: '0.5rem', width: 'auto', marginBottom: '1.5rem', color: '#94a3b8' }} onClick={() => navigate(-1)}>
          <ArrowLeft size={24} /> Voltar
        </button>
        <h1>Política de Privacidade</h1>
        <p>Transparência total sobre seu anonimato e segurança.</p>
      </header>

      <div className="glass-panel" style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '0.95rem' }}>

        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '1rem' }}>
            <EyeOff size={24} />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Anonimato Garantido</h2>
          </div>
          <p>O MeuBusApp **não coleta** e nunca pedirá seu nome, CPF, e-mail, telefone ou qualquer dado que identifique você pessoalmente. Seu aparelho recebe uma identidade digital anônima apenas para que o sistema funcione.</p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--secondary)', marginBottom: '1rem' }}>
            <Trash2 size={24} />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Dados de Localização Temporários</h2>
          </div>
          <p>Quando você transmite sua localização como passageiro, os dados são usados estritamente para mostrar a movimentação do ônibus no tempo real. **Após 5 minutos de inatividade, sua posição é apagada permanentemente** do nosso banco de dados.</p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', marginBottom: '1rem' }}>
            <BarChart3 size={24} />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Google Analytics e Cookies</h2>
          </div>
          <p>Utilizamos o Google Analytics para entender a aderência ao sistema e melhorar a experiência em Sete Lagoas. Isso coleta dados técnicos (como o tipo de navegador e páginas visitadas) via cookies. **Nenhum dado de movimentação pessoal do GPS é enviado ao Google Analytics.**</p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', marginBottom: '1rem' }}>
            <ShieldCheck size={24} />
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Segurança de Infraestrutura</h2>
          </div>
          <p>Todas as comunicações entre seu celular e nossos servidores utilizam criptografia de ponta (SSL/HTTPS). O acesso ao nosso banco de dados é protegido por camadas de segurança (RLS) que impedem acessos não autorizados por outros usuários.</p>
        </section>

        <section style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Ao utilizar o MeuBusApp, você colabora com uma cidade mais conectada e concorda com esses termos de uso anônimo.
          </p>
        </section>

      </div>

      <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#475569', marginTop: '2rem' }}>
        Última atualização: Abril de 2026. <br /> Sete Lagoas, Minas Gerais.
      </p>
      <Footer />
    </div>
  );
}
