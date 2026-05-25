import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const DEVICE_ID_KEY = 'meubusapp_device_id';
// localStorage keys kept only as fast-read cache for UI; authoritative data is in DB
const STREAK_KEY = 'meubusapp_streak';
const REFERRER_KEY = 'meubusapp_referrer';

/**
 * Get or create a persistent device ID using crypto-secure random values.
 */
export const getDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0,
          v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

/**
 * Returns the referral code for sharing (first 8 chars of device ID, uppercase).
 */
export const getReferralCode = () => {
  return getDeviceId().replace(/-/g, '').substring(0, 8).toUpperCase();
};

/**
 * Store referrer code from URL param on first visit.
 * Only stores if there is no referrer yet — DB will enforce idempotency.
 */
export const storeReferrerIfNew = (code) => {
  if (!code) return;
  if (!localStorage.getItem(REFERRER_KEY)) {
    localStorage.setItem(REFERRER_KEY, code.toUpperCase());
  }
};

/** Read current streak from localStorage cache (updated after each DB call) */
export const getStreak = () => parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);

/**
 * Update streak via atomic DB RPC.
 * Falls back to localStorage-only calculation if the RPC doesn't exist.
 * Returns { newStreak, bonusPoints, isMilestone }
 */
export const updateStreak = async (deviceId) => {
  try {
    const { data, error } = await supabase.rpc('atualizar_streak', {
      p_device_id: deviceId,
    });

    if (!error && data) {
      const result = {
        newStreak: data.new_streak,
        bonusPoints: data.bonus_points,
        isMilestone: data.is_milestone,
      };
      // Update localStorage cache for immediate UI reads
      localStorage.setItem(STREAK_KEY, String(result.newStreak));
      return result;
    }
  } catch (e) {
    console.warn('atualizar_streak RPC falhou, usando fallback local:', e);
  }

  // Fallback: localStorage-only (less reliable but still works)
  const LAST_TRIP_DATE_KEY = 'meubusapp_last_trip_date';
  const today = () => new Date().toLocaleDateString('sv');
  const yesterday = () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('sv');
  };

  const lastDate = localStorage.getItem(LAST_TRIP_DATE_KEY);
  const currentStreak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
  const todayStr = today();

  if (lastDate === todayStr) {
    return { newStreak: currentStreak, bonusPoints: 0, isMilestone: false };
  }

  const newStreak = lastDate === yesterday() ? currentStreak + 1 : 1;
  localStorage.setItem(STREAK_KEY, String(newStreak));
  localStorage.setItem(LAST_TRIP_DATE_KEY, todayStr);

  const milestones = { 3: 5, 7: 10, 14: 20, 30: 30 };
  const bonusPoints = milestones[newStreak] || 0;

  return { newStreak, bonusPoints, isMilestone: bonusPoints > 0 };
};

export function usePoints() {
  const [totalPoints, setTotalPoints] = useState(0);
  const [hasPhone, setHasPhone] = useState(true); // assume true até saber (evita flash do aviso)
  const deviceId = getDeviceId();

  const fetchPoints = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('perfis')
        .select('pontos, streak_atual, telefone')
        .eq('id', deviceId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile does not exist yet — create it
        const code = getReferralCode();
        const { data: newData } = await supabase
          .from('perfis')
          .insert({ id: deviceId, pontos: 0, referral_code: code })
          .select('pontos')
          .single();
        if (newData) setTotalPoints(newData.pontos || 0);
        setHasPhone(false); // perfil novo nunca tem telefone
      } else if (data) {
        setTotalPoints(data.pontos || 0);
        setHasPhone(!!data.telefone);
        // Sync streak cache from DB
        if (data.streak_atual != null) {
          localStorage.setItem(STREAK_KEY, String(data.streak_atual));
        }
      }
    } catch (e) {
      console.error('Erro ao buscar pontos:', e);
    }
  }, [deviceId]);

  /**
   * Atomic point addition via Supabase RPC.
   * No client-side fallback upsert — the RPC is the single source of truth.
   */
  const addPointsDB = useCallback(
    async (pts) => {
      try {
        const { data, error } = await supabase.rpc('adicionar_pontos', {
          p_device_id: deviceId,
          p_pontos: pts,
        });

        if (!error && data != null) {
          setTotalPoints(data);
          return true;
        }

        if (error) {
          console.warn('RPC adicionar_pontos erro:', error.message);
          // Refresh points from DB so UI stays consistent
          await fetchPoints();
        }

        return false;
      } catch (e) {
        console.error('Erro ao adicionar pontos:', e);
        return false;
      }
    },
    [deviceId, fetchPoints]
  );

  /**
   * Process referral reward via atomic server-side RPC.
   * The DB function handles idempotency and prevents double-awarding.
   */
  const processReferralIfNeeded = useCallback(async () => {
    const referrerCode = localStorage.getItem(REFERRER_KEY);
    if (!referrerCode) return;

    try {
      const { data: success } = await supabase.rpc('processar_referral', {
        p_device_id: deviceId,
        p_referral_code: referrerCode,
      });

      if (success) {
        // Remove from localStorage — DB is now authoritative
        localStorage.removeItem(REFERRER_KEY);
        await fetchPoints(); // Refresh to show new balance
        console.log('Referral processado com sucesso!');
      }
    } catch (e) {
      console.error('Erro ao processar referral:', e);
    }
  }, [deviceId, fetchPoints]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  return {
    totalPoints,
    hasPhone,
    addPoints: addPointsDB,
    deviceId,
    refreshPoints: fetchPoints,
    processReferralIfNeeded,
  };
}
