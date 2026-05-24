import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Camera, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';

export default function Merchant() {
  const { shopId } = useParams();
  const [shopName, setShopName] = useState('Lojista');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle'); // idle, validating, success, error, scanning
  const [errorMsg, setErrorMsg] = useState('');

  // Store scanner instance in ref to prevent memory leaks
  const scannerRef = useRef(null);

  useEffect(() => {
    if (shopId) {
      fetchShopInfo();
    }

    // Cleanup: stop scanner when component unmounts
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const fetchShopInfo = async () => {
    const { data } = await supabase.from('lojas').select('nome').eq('id', shopId).single();
    if (data) setShopName(data.nome);
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // Only stop if it's currently scanning (state 2 = SCANNING)
        if (state === 2) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.warn('Scanner cleanup:', err);
      }
      scannerRef.current = null;
    }
  };

  const startScanner = () => {
    setStatus('scanning');
    setTimeout(async () => {
      // Stop any existing scanner first
      await stopScanner();

      const html5QrCode = new Html5Qrcode('reader');
      scannerRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setCode(decodedText.toUpperCase());
            stopScanner();
            setStatus('idle');
            validateCoupon(decodedText);
          },
          () => {
            /* scanning... */
          }
        );
      } catch (err) {
        console.error('Camera Error:', err);
        setErrorMsg('Não foi possível acessar a câmera.');
        setStatus('error');
        scannerRef.current = null;
      }
    }, 100);
  };

  const handleCloseScanner = async () => {
    await stopScanner();
    setStatus('idle');
  };

  const validateCoupon = async (manualCode) => {
    const codeToValidate = (manualCode || code).trim().toUpperCase();
    if (codeToValidate.length < 5) return;

    setStatus('validating');
    setErrorMsg('');

    try {
      const { data: result, error } = await supabase.rpc('validar_cupom_lojista', {
        p_codigo: codeToValidate,
        p_loja_id: shopId,
      });

      if (error) {
        setStatus('error');
        setErrorMsg(`Erro técnico: ${error.message}`);
        return;
      }

      if (!result?.ok) {
        setStatus('error');
        setErrorMsg(result?.erro || 'Cupom inválido.');
      } else {
        setStatus('success');
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg('Erro de conexão. Tente novamente.');
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Painel: {shopName}</h1>
        <p>Valide o brinde do passageiro abaixo.</p>
      </header>

      <div className="glass-panel" style={{ textAlign: 'center', position: 'relative' }}>
        {status === 'scanning' && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: '#000',
              zIndex: 2000,
              padding: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: 'white',
                marginBottom: '20px',
              }}
            >
              <h3>Aponte para o QR Code</h3>
              <button
                onClick={handleCloseScanner}
                aria-label="Fechar scanner"
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={30} />
              </button>
            </div>
            <div
              id="reader"
              style={{ width: '100%', borderRadius: '15px', overflow: 'hidden' }}
            ></div>
            <p style={{ color: '#94a3b8', marginTop: '20px' }}>
              O código será lido automaticamente.
            </p>
          </div>
        )}

        {status !== 'success' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={startScanner}
                style={{ padding: '2rem', fontSize: '1.2rem', gap: '15px' }}
              >
                <Camera size={32} />
                Escanear Celular do Cliente
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b' }}>
                <hr style={{ flex: 1, opacity: 0.2 }} />
                <span>OU DIGITE</span>
                <hr style={{ flex: 1, opacity: 0.2 }} />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="CÓDIGO"
                  style={{
                    textAlign: 'center',
                    fontSize: '2rem',
                    letterSpacing: '4px',
                    textTransform: 'uppercase',
                    marginBottom: '1rem',
                  }}
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />

                {status === 'error' && (
                  <div
                    style={{
                      color: 'var(--danger)',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertTriangle size={18} /> {errorMsg}
                  </div>
                )}

                <button
                  className="btn btn-outline"
                  onClick={() => validateCoupon()}
                  disabled={status === 'validating'}
                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                >
                  {status === 'validating' ? 'Validando...' : 'Confirmar Digitação'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '2rem 0' }}>
            <CheckCircle size={80} color="var(--primary)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>
              VALIDADO COM SUCESSO!
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
              O brinde já pode ser entregue.
            </p>

            <button
              className="btn btn-outline"
              onClick={() => {
                setStatus('idle');
                setCode('');
              }}
            >
              Próximo Atendimento
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'rgba(59, 130, 246, 0.1)',
          borderRadius: '10px',
          fontSize: '0.8rem',
          color: 'var(--secondary)',
        }}
      >
        🔒 Sua loja: <strong>{shopName}</strong>. Registro vinculado ao ID: {shopId}
      </div>
    </div>
  );
}
