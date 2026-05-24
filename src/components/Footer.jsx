import { MessageCircle } from 'lucide-react';

export default function Footer() {
  const whatsappLink = "https://wa.me/5531983315536?text=Ol%C3%A1%2C%20estou%20tendo%20um%20problema%20com%20o%20MeuBusApp.";

  return (
    <footer style={{
      marginTop: '2rem',
      padding: '1rem 0',
      textAlign: 'center',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      width: '100%'
    }}>
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#94a3b8',
          textDecoration: 'none',
          fontSize: '0.85rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          opacity: 0.8,
          transition: 'opacity 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
        onMouseOut={(e) => e.currentTarget.style.opacity = '0.8'}
      >
        <MessageCircle size={16} />
        Reportar um problema
      </a>
    </footer>
  );
}
