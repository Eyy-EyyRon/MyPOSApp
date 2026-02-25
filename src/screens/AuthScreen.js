import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, StatusBar, Image,
  ScrollView, ActivityIndicator, Dimensions, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  ink:       '#0D0D14',
  navy:      '#130F5F',
  navyDeep:  '#0B0A3E',
  navyMid:   '#1E1A7A',
  slate:     '#2A2A40',
  fog:       '#F0F0F7',
  mist:      '#E4E4F0',
  cloud:     '#FAFAFA',
  white:     '#FFFFFF',
  ghost:     '#9898B0',
  text:      '#1A1A2E',
  danger:    '#D93025',
  dangerBg:  '#FFF0EF',
  gold:      '#C8960C',
  goldBg:    '#FEF9E7',
  success:   '#0F7B55',
  // Lock screen tokens
  bg:          '#080A12',
  surface:     '#10131F',
  surfaceUp:   '#161B2C',
  surfaceMid:  '#1E2540',
  border:      '#1F2640',
  borderBright:'#2D3655',
  gold2:       '#FFB800',
  goldDim:     '#7A5800',
  goldBg2:     '#1E1400',
  goldGlow:    '#FFB80030',
  textPrimary: '#EAEEF8',
  textSec:     '#6B7A9F',
  textMuted:   '#3A4560',
};

const ROLE_META = {
  manager: { icon: 'briefcase', label: 'Manager', color: '#60A5FA', colorBg: '#0D1F3C' },
  merchant: { icon: 'storefront', label: 'Staff', color: '#34D399', colorBg: '#052E1F' },
  owner: { icon: 'shield-checkmark', label: 'Owner', color: '#F59E0B', colorBg: '#1E1400' },
};

const ACCOUNTS_KEY = 'pos_saved_accounts_v1';

// ─── CLOCK HOOK ───────────────────────────────────────────────────────────────
const useClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
};

// ─── FLOATING INPUT ───────────────────────────────────────────────────────────
const FloatingInput = ({
  icon, label, shortLabel, value, onChange,
  secure = false, autoCap = 'none', keyboardType = 'default', style
}) => {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);
  const borderAnim = useRef(new Animated.Value(0)).current;
  const onFocus = () => { setFocused(true); Animated.timing(borderAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start(); };
  const onBlur  = () => { setFocused(false); Animated.timing(borderAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start(); };
  const borderColor = borderAnim.interpolate({ inputRange: [0, 1], outputRange: [C.mist, C.navy] });
  return (
    <Animated.View style={[styles.floatWrap, { borderColor }, style]}>
      <Ionicons name={icon} size={18} color={focused ? C.navy : C.ghost} style={styles.floatIcon} />
      <View style={styles.floatInner}>
        {(focused || value.length > 0) && (
          <Text style={[styles.floatLabel, { color: focused ? C.navy : C.ghost }]}>{label}</Text>
        )}
        <TextInput
          style={[styles.floatInput, !(focused || value.length > 0) && { paddingTop: 0 }]}
          placeholder={!focused && value.length === 0 ? (shortLabel || label) : ''}
          placeholderTextColor={C.ghost}
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          secureTextEntry={hidden}
          autoCapitalize={autoCap}
          keyboardType={keyboardType}
        />
      </View>
      {secure && (
        <TouchableOpacity onPress={() => setHidden(h => !h)} style={styles.eyeBtn}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.ghost} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const TabPill = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.tabPill, active && styles.tabPillActive]} onPress={onPress} activeOpacity={0.75}>
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const RoleCard = ({ icon, title, subtitle, active, onPress }) => (
  <TouchableOpacity style={[styles.roleCard, active && styles.roleCardActive]} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.roleIconBox, active && styles.roleIconBoxActive]}>
      <Ionicons name={icon} size={22} color={active ? C.white : C.ghost} />
    </View>
    <Text style={[styles.roleTitle, active && { color: C.navy }]}>{title}</Text>
    <Text style={[styles.roleSub, active && { color: C.navyMid }]}>{subtitle}</Text>
    {active && <View style={styles.roleCheck}><Ionicons name="checkmark" size={12} color={C.white} /></View>}
  </TouchableOpacity>
);

// ─── ANIMATED ACCOUNT CARD ────────────────────────────────────────────────────
const AccountCard = ({ acc, index, onPress, onRemove }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: index * 80, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, delay: index * 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 70, friction: 12, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn  = () => Animated.spring(pressAnim, { toValue: 0.94, tension: 120, friction: 10, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(pressAnim, { toValue: 1,    tension: 120, friction: 10, useNativeDriver: true }).start();

  const roleMeta = ROLE_META[acc.role] || ROLE_META.merchant;

  return (
    <Animated.View style={[
      styles.accountCardOuter,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: Animated.multiply(scaleAnim, pressAnim) }] }
    ]}>
      <TouchableOpacity
        style={styles.accountCard}
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Gold top accent line */}
        <View style={styles.cardAccentLine} />

        {/* Avatar */}
        <View style={styles.avatarRingOuter}>
          <View style={styles.avatarRingInner}>
            <View style={styles.darkAvatarBox}>
              {acc.avatar_url
                ? <Image source={{ uri: acc.avatar_url }} style={styles.avatarImage} />
                : <Text style={styles.darkAvatarInitials}>{acc.first_name?.[0]?.toUpperCase()}</Text>
              }
            </View>
          </View>
        </View>

        {/* Name */}
        <Text style={styles.accountName} numberOfLines={1}>{acc.first_name}</Text>
        {acc.last_name ? <Text style={styles.accountLastName} numberOfLines={1}>{acc.last_name}</Text> : null}

        {/* Role chip */}
        <View style={[styles.roleChip, { backgroundColor: roleMeta.colorBg, borderColor: roleMeta.color + '44' }]}>
          <Ionicons name={roleMeta.icon} size={10} color={roleMeta.color} />
          <Text style={[styles.roleChipText, { color: roleMeta.color }]}>{roleMeta.label.toUpperCase()}</Text>
        </View>

        {/* Tap hint */}
        <View style={styles.tapHint}>
          <Ionicons name="keypad-outline" size={11} color={C.textMuted} />
          <Text style={styles.tapHintText}>Tap to unlock</Text>
        </View>
      </TouchableOpacity>

      {/* Remove button */}
      <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={12} color={C.textSec} />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── ADD NEW CARD ─────────────────────────────────────────────────────────────
const AddNewCard = ({ index, onPress }) => {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, delay: index * 80, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity style={styles.addNewCard} onPress={onPress} activeOpacity={0.75}>
        <View style={styles.addNewIconRing}>
          <Ionicons name="add" size={26} color={C.gold2} />
        </View>
        <Text style={styles.addNewLabel}>Add Account</Text>
        <Text style={styles.addNewSub}>Sign in with new credentials</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── ANIMATED NUM KEY ─────────────────────────────────────────────────────────
const NumKey = ({ label, isIcon, onPress, empty }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgAnim    = useRef(new Animated.Value(0)).current;
  if (empty) return <View style={styles.numBtnEmpty} />;

  const onPressIn  = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.88, tension: 150, friction: 10, useNativeDriver: true }),
      Animated.timing(bgAnim,    { toValue: 1, duration: 80, useNativeDriver: false }),
    ]).start();
  };
  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 150, friction: 10, useNativeDriver: true }),
      Animated.timing(bgAnim,    { toValue: 0, duration: 150, useNativeDriver: false }),
    ]).start();
    onPress();
  };

  const bgColor = bgAnim.interpolate({ inputRange: [0, 1], outputRange: [C.surfaceUp, C.surfaceMid] });

  return (
    <Animated.View style={[styles.numBtnOuter, { transform: [{ scale: scaleAnim }] }]}>
      <Animated.View style={[styles.numBtn, { backgroundColor: bgColor }]}>
        <TouchableOpacity
          style={styles.numBtnTouchable}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          activeOpacity={1}
        >
          {isIcon
            ? <Ionicons name={label} size={24} color={C.textSec} />
            : <Text style={styles.numText}>{label}</Text>
          }
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

// ─── PIN DOT ─────────────────────────────────────────────────────────────────
const PinDot = ({ filled, hasError }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevFilled = useRef(false);

  useEffect(() => {
    if (filled && !prevFilled.current) {
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.4, tension: 200, friction: 6, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1,   tension: 200, friction: 6, useNativeDriver: true }),
      ]).start();
    }
    prevFilled.current = filled;
  }, [filled]);

  const dotColor = hasError ? '#EF4444' : filled ? C.gold2 : 'transparent';
  const borderColor = hasError ? '#EF4444' : filled ? C.gold2 : C.borderBright;

  return (
    <Animated.View style={[
      styles.pinDot,
      {
        backgroundColor: dotColor,
        borderColor,
        transform: [{ scale: scaleAnim }],
        shadowColor: filled && !hasError ? C.gold2 : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: filled ? 0.9 : 0,
        shadowRadius: 10,
        elevation: filled ? 6 : 0,
      }
    ]} />
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AuthScreen({ isBanned, forcePasswordChange, onPasswordChanged }) {
  const now = useClock();

  const [view, setView] = useState('loading');
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('merchant');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [showForceChange, setShowForceChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;

  // Header entrance animations
  const headerFade  = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;

  useEffect(() => { loadSavedAccounts(); }, []);

  useEffect(() => {
    if (view === 'accounts' || view === 'enter_pin') {
      Animated.parallel([
        Animated.timing(headerFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(headerSlide, { toValue: 0, tension: 60, friction: 14, useNativeDriver: true }),
      ]).start();
    } else {
      headerFade.setValue(0);
      headerSlide.setValue(-20);
    }
  }, [view]);

  const loadSavedAccounts = async () => {
    try {
      const stored = await SecureStore.getItemAsync(ACCOUNTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedAccounts(parsed);
        setView(parsed.length > 0 ? 'accounts' : 'auth_form');
      } else { setView('auth_form'); }
    } catch { setView('auth_form'); }
  };

  useEffect(() => { if (forcePasswordChange) setShowForceChange(true); }, [forcePasswordChange]);

  const switchTab = (toLogin) => {
    Animated.timing(slideAnim, { toValue: toLogin ? 0 : 1, duration: 250, useNativeDriver: true }).start();
    setIsLogin(toLogin);
  };

  useEffect(() => {
    if (pin.length === 4 && view === 'enter_pin') executePinLogin();
  }, [pin]);

  const triggerShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 35, useNativeDriver: true }),
    ]).start();
  };

  const executePinLogin = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    if (pin === selectedAccount.pin) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: selectedAccount.email, password: selectedAccount.password });
        if (error) throw error;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        triggerShake();
        setPinError('Login failed. Password may have changed.');
        setPin('');
        setLoading(false);
      }
    } else {
      triggerShake();
      setPinError('Incorrect PIN');
      setPin('');
      setLoading(false);
    }
  };

  const handleNumpadPress = (num) => {
    if (pin.length < 4) { setPin(prev => prev + num); setPinError(''); }
  };

  const handleBackspace = () => {
    if (pin.length > 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPin(prev => prev.slice(0, -1)); setPinError(''); }
  };

  const removeAccount = async (idToRemove) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = savedAccounts.filter(acc => acc.id !== idToRemove);
    await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(updated));
    setSavedAccounts(updated);
    if (updated.length === 0) setView('auth_form');
  };

  const handleAuth = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isLogin) {
        if (!email || !password) throw new Error('Please enter email and password.');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        if (!email || !password || !firstName || !lastName) throw new Error('Please fill in all personal details.');
        if (role === 'manager' && !storeName) throw new Error('Managers must provide a Store Name.');
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, role, store_name: role === 'manager' ? storeName : null, status: 'active' } } });
        if (error) throw error;
        await supabase.auth.signOut();
        Alert.alert('Account Created', 'Welcome! Please sign in to continue.');
        switchTab(true);
      }
    } catch (err) { Alert.alert('Oops', err.message); }
    finally { if (!forcePasswordChange) setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!email) { Alert.alert('Email Required', 'Enter your email address above first.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Check Your Inbox', 'A password reset link has been sent to your email.');
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) return Alert.alert('Too Short', 'Password must be at least 6 characters.');
    if (newPassword !== confirmPassword) return Alert.alert('Mismatch', 'Passwords do not match.');
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: profileError } = await supabase.from('profiles').update({ must_change_password: false, is_new_user: false }).eq('id', user.id);
      if (profileError) throw profileError;
      Alert.alert('All Set!', 'Your password has been updated.', [{ text: 'Continue', onPress: () => { setShowForceChange(false); if (onPasswordChanged) onPasswordChanged(); } }]);
    } catch (err) { Alert.alert('Update Failed', err.message); }
    finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowForceChange(false);
    setLoading(false);
    setView(savedAccounts.length > 0 ? 'accounts' : 'auth_form');
  };

  // ── TIME FORMATTING ──
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const [timeMain, timeSuffix] = timeStr.split(' ');

  // ─────────────────────────────────────────────────────────────
  if (view === 'loading') return <View style={styles.fullCenter}><ActivityIndicator size="large" color={C.gold2} /></View>;

  // ── BANNED ──
  if (isBanned) {
    return (
      <View style={styles.fullCenter}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.bannedBlock} />
        <View style={styles.bannedCard}>
          <View style={styles.bannedIconRing}><Ionicons name="ban" size={36} color={C.danger} /></View>
          <Text style={styles.bannedTitle}>Account Suspended</Text>
          <Text style={styles.bannedBody}>Your access to this store has been revoked by an administrator.</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={C.ink} />
            <Text style={styles.outlineBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── FORCE PASSWORD CHANGE ──
  if (showForceChange) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
          <View style={styles.accentStrip} />
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.headerBadge, { backgroundColor: C.goldBg }]}><Ionicons name="key" size={28} color={C.gold} /></View>
              <Text style={styles.cardTitle}>Set New Password</Text>
              <Text style={styles.cardSub}>Action required — please update before continuing.</Text>
            </View>
            <FloatingInput icon="lock-closed-outline" label="New Password" value={newPassword} onChange={setNewPassword} secure />
            <View style={{ height: 14 }} />
            <FloatingInput icon="shield-checkmark-outline" label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} secure />
            <TouchableOpacity style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]} onPress={handleChangePassword} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color={C.white} size="small" /> : <><Text style={styles.primaryBtnText}>Update Password</Text><Ionicons name="arrow-forward" size={18} color={C.white} style={{ marginLeft: 8 }} /></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.ghostBtn}><Text style={styles.ghostBtnText}>Cancel & Sign Out</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ══════════════════════════════════════════════════════════
  // 🌟 GRID LOCK SCREEN
  // ══════════════════════════════════════════════════════════
  if (view === 'accounts') {
    return (
      <View style={styles.lockContainer}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        {/* ── Atmospheric background layers ── */}
        <View style={styles.bgGlow1} />
        <View style={styles.bgGlow2} />
        <View style={styles.bgGrid} />

        <ScrollView
          contentContainerStyle={styles.lockScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Clock block ── */}
          <Animated.View style={[styles.clockBlock, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
            <View style={styles.clockRow}>
              <Text style={styles.clockTime}>{timeMain}</Text>
              <Text style={styles.clockSuffix}>{timeSuffix}</Text>
            </View>
            <Text style={styles.clockDate}>{dateStr}</Text>
            <View style={styles.clockDivider} />
            <Text style={styles.lockPrompt}>Select your profile to continue</Text>
          </Animated.View>

          {/* ── Account grid ── */}
          <View style={styles.accountGrid}>
            {savedAccounts.map((acc, index) => (
              <AccountCard
                key={acc.id}
                acc={acc}
                index={index}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectedAccount(acc);
                  setPin('');
                  setPinError('');
                  setView('enter_pin');
                }}
                onRemove={() => removeAccount(acc.id)}
              />
            ))}
            <AddNewCard
              index={savedAccounts.length}
              onPress={() => { setEmail(''); setPassword(''); setView('auth_form'); }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════
  // 🌟 PIN ENTRY SCREEN
  // ══════════════════════════════════════════════════════════
  if (view === 'enter_pin') {
    const roleMeta = ROLE_META[selectedAccount?.role] || ROLE_META.merchant;
    const hasError = pinError.length > 0;

    return (
      <View style={styles.lockContainer}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />

        {/* Background */}
        <View style={styles.bgGlow1} />
        <View style={styles.bgGlow2} />
        <View style={styles.bgGrid} />

        {/* Back button */}
        <TouchableOpacity style={styles.pinBackBtn} onPress={() => setView('accounts')}>
          <Ionicons name="arrow-back" size={18} color={C.gold2} />
        </TouchableOpacity>

        {/* ── PIN header ── */}
        <Animated.View style={[styles.pinHeaderWrap, { transform: [{ translateX: shakeAnim }] }]}>

          {/* Avatar */}
          <View style={styles.pinAvatarOuter}>
            <View style={[styles.pinAvatarRing, { borderColor: hasError ? '#EF4444' : roleMeta.color + '66' }]}>
              <View style={[styles.pinAvatarBox, { backgroundColor: roleMeta.colorBg }]}>
                {selectedAccount?.avatar_url
                  ? <Image source={{ uri: selectedAccount.avatar_url }} style={styles.avatarImage} />
                  : <Text style={[styles.pinAvatarInitials, { color: roleMeta.color }]}>
                      {selectedAccount?.first_name?.[0]?.toUpperCase()}
                    </Text>
                }
              </View>
            </View>
          </View>

          {/* Name + role */}
          <Text style={styles.pinGreeting}>
            Hello, <Text style={styles.pinGreetingName}>{selectedAccount?.first_name}</Text>
          </Text>
          <View style={[styles.pinRoleChip, { backgroundColor: roleMeta.colorBg, borderColor: roleMeta.color + '44' }]}>
            <Ionicons name={roleMeta.icon} size={11} color={roleMeta.color} />
            <Text style={[styles.pinRoleText, { color: roleMeta.color }]}>{roleMeta.label.toUpperCase()}</Text>
          </View>

          <Text style={styles.pinInstructions}>Enter your 4-digit PIN</Text>

          {/* PIN dots */}
          <View style={styles.dotsContainer}>
            {[0, 1, 2, 3].map(i => (
              <PinDot key={i} filled={pin.length > i} hasError={hasError} />
            ))}
          </View>

          {/* Error message */}
          {hasError && (
            <Animated.View style={styles.pinErrorBox}>
              <Ionicons name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.pinErrorText}>{pinError}</Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* ── Numpad ── */}
        <View style={styles.numpad}>
          {[[1,2,3],[4,5,6],[7,8,9]].map((row, rIdx) => (
            <View key={rIdx} style={styles.numRow}>
              {row.map(num => (
                <NumKey key={num} label={num.toString()} onPress={() => handleNumpadPress(num.toString())} />
              ))}
            </View>
          ))}
          <View style={styles.numRow}>
            <NumKey empty />
            <NumKey label="0" onPress={() => handleNumpadPress('0')} />
            <NumKey label="backspace-outline" isIcon onPress={handleBackspace} />
          </View>
        </View>

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={C.gold2} />
              <Text style={styles.loadingText}>Authenticating…</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── MAIN EMAIL/PASSWORD AUTH FORM ────────────────────────────────────────────
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />
      <View style={styles.brandBar}>
        {savedAccounts.length > 0 && (
          <TouchableOpacity onPress={() => setView('accounts')} style={{ marginRight: 15, padding: 5 }}>
            <Ionicons name="arrow-back" size={24} color={C.white} />
          </TouchableOpacity>
        )}
        <Text style={styles.brandName}>Crochet Collections POS</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollMain} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.cornerTL} />
        <View style={styles.cornerBR} />
        <View style={styles.card}>
          <View style={styles.tabRow}>
            <TabPill label="Sign In" active={isLogin} onPress={() => switchTab(true)} />
            <TabPill label="Create Account" active={!isLogin} onPress={() => switchTab(false)} />
          </View>
          <View style={styles.authHeader}>
            <Text style={styles.authTitle}>{isLogin ? 'Welcome back' : 'Join the team'}</Text>
            <Text style={styles.authSub}>{isLogin ? 'Sign in to manage your operations' : 'Create your account to get started'}</Text>
          </View>
          {!isLogin && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>I AM A</Text>
              <View style={styles.roleRow}>
                <RoleCard icon="person-outline" title="Staff" subtitle="Join a store" active={role === 'merchant'} onPress={() => setRole('merchant')} />
                <RoleCard icon="briefcase-outline" title="Manager" subtitle="Own a store" active={role === 'manager'} onPress={() => setRole('manager')} />
              </View>
            </View>
          )}
          {!isLogin && (
            <View style={[styles.section, { flexDirection: 'row', gap: 12 }]}>
              <FloatingInput icon="person-outline" label="First Name" shortLabel="First" value={firstName} onChange={setFirstName} autoCap="words" style={{ flex: 1 }} />
              <FloatingInput icon="person-outline" label="Last Name" shortLabel="Last" value={lastName} onChange={setLastName} autoCap="words" style={{ flex: 1 }} />
            </View>
          )}
          {!isLogin && role === 'manager' && (
            <View style={styles.section}>
              <FloatingInput icon="business-outline" label="Store Name" value={storeName} onChange={setStoreName} autoCap="words" />
            </View>
          )}
          {!isLogin && (
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Account Details</Text>
              <View style={styles.dividerLine} />
            </View>
          )}
          <View style={{ gap: 14 }}>
            <FloatingInput icon="mail-outline" label="Email Address" value={email} onChange={setEmail} keyboardType="email-address" />
            <FloatingInput icon="lock-closed-outline" label="Password" value={password} onChange={setPassword} secure />
          </View>
          {isLogin && (
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotRow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]} onPress={handleAuth} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color={C.white} size="small" /> : <><Text style={styles.primaryBtnText}>{isLogin ? 'Sign In' : 'Create Account'}</Text><Ionicons name="arrow-forward" size={18} color={C.white} style={{ marginLeft: 8 }} /></>}
          </TouchableOpacity>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{isLogin ? "Don't have an account? " : 'Already have an account? '}</Text>
            <TouchableOpacity onPress={() => switchTab(!isLogin)}><Text style={styles.switchLink}>{isLogin ? 'Sign Up' : 'Sign In'}</Text></TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CARD_WIDTH = (width - 56) / 2;

const styles = StyleSheet.create({
  // ═══════════════════════════════════════
  // LOCK SCREEN SHARED
  // ═══════════════════════════════════════
  lockContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Atmospheric background
  bgGlow1: {
    position: 'absolute',
    top: -height * 0.15,
    left: -width * 0.2,
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: '#1A0E6B',
    opacity: 0.35,
  },
  bgGlow2: {
    position: 'absolute',
    bottom: -height * 0.1,
    right: -width * 0.15,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: '#0D1A3D',
    opacity: 0.4,
  },
  bgGrid: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0.04,
    // Simulated dot grid via repeated borders (RN limitation — keeps it lightweight)
    borderWidth: 0,
  },

  // ═══════════════════════════════════════
  // GRID LOCK SCREEN
  // ═══════════════════════════════════════
  lockScrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 56 : 72,
    paddingBottom: 60,
    alignItems: 'center',
  },

  // Clock
  clockBlock: {
    alignItems: 'center',
    marginBottom: 44,
    paddingHorizontal: 20,
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  clockTime: {
    fontSize: 72,
    fontWeight: '900',
    color: C.textPrimary,
    letterSpacing: -3,
    lineHeight: 76,
  },
  clockSuffix: {
    fontSize: 22,
    fontWeight: '700',
    color: C.gold2,
    marginTop: 14,
    letterSpacing: 0.5,
  },
  clockDate: {
    fontSize: 15,
    color: C.textSec,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  clockDivider: {
    width: 40,
    height: 2,
    backgroundColor: C.goldDim,
    borderRadius: 1,
    marginTop: 18,
    marginBottom: 14,
  },
  lockPrompt: {
    fontSize: 13,
    color: C.textMuted,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Account grid
  accountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
    width: '100%',
  },

  // Account card
  accountCardOuter: {
    width: CARD_WIDTH,
    position: 'relative',
  },
  accountCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    overflow: 'hidden',
    // Subtle inner shadow via layered borders
    shadowColor: C.gold2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  cardAccentLine: {
    position: 'absolute',
    top: 0, left: '20%', right: '20%',
    height: 2,
    backgroundColor: C.gold2,
    borderRadius: 1,
    opacity: 0.6,
  },

  // Avatar rings
  avatarRingOuter: {
    width: 76,
    height: 76,
    borderRadius: 24,
    padding: 3,
    backgroundColor: C.goldGlow,
    marginBottom: 14,
    // Glow
    shadowColor: C.gold2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  avatarRingInner: {
    flex: 1,
    borderRadius: 21,
    padding: 2,
    backgroundColor: C.surfaceUp,
    borderWidth: 1,
    borderColor: C.gold2 + '55',
  },
  darkAvatarBox: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: C.goldBg2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  darkAvatarInitials: {
    color: C.gold2,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  accountName: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 2,
    textAlign: 'center',
  },
  accountLastName: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },

  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
  },
  roleChipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  tapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.5,
  },
  tapHintText: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: '600',
  },

  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: C.surfaceMid,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderBright,
    zIndex: 10,
  },

  // Add new card
  addNewCard: {
    width: CARD_WIDTH,
    backgroundColor: 'transparent',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: C.borderBright,
    borderStyle: 'dashed',
    paddingVertical: 28,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNewIconRing: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.goldBg2,
    borderWidth: 1,
    borderColor: C.gold2 + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  addNewLabel: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  addNewSub: {
    color: C.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },

  // ═══════════════════════════════════════
  // PIN ENTRY SCREEN
  // ═══════════════════════════════════════
  pinBackBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 60,
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    backgroundColor: C.surface,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.gold2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  pinHeaderWrap: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 100 : 120,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },

  // Avatar for PIN screen
  pinAvatarOuter: {
    marginBottom: 22,
    shadowColor: C.gold2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  pinAvatarRing: {
    width: 88,
    height: 88,
    borderRadius: 26,
    borderWidth: 2,
    padding: 4,
    borderColor: C.gold2 + '66',
  },
  pinAvatarBox: {
    flex: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinAvatarInitials: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },

  pinGreeting: {
    fontSize: 22,
    fontWeight: '700',
    color: C.textSec,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  pinGreetingName: {
    color: C.textPrimary,
    fontWeight: '900',
  },
  pinRoleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  pinRoleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pinInstructions: {
    fontSize: 13,
    color: C.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 24,
  },

  // Dots
  dotsContainer: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 16,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },

  // Error
  pinErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2D0E0E',
    borderWidth: 1,
    borderColor: '#EF444444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },

  // Numpad
  numpad: {
    paddingHorizontal: 32,
    gap: 12,
    paddingBottom: Platform.OS === 'ios' ? 50 : 36,
  },
  numRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  numBtnOuter: {
    width: 78,
    height: 78,
  },
  numBtn: {
    flex: 1,
    borderRadius: 39,
    backgroundColor: C.surfaceUp,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    // Subtle glow
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  numBtnTouchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numBtnEmpty: {
    width: 78,
    height: 78,
  },
  numText: {
    fontSize: 30,
    fontWeight: '400',
    color: C.textPrimary,
    letterSpacing: -0.5,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 18, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingCard: {
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.gold2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  loadingText: {
    color: C.gold2,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ═══════════════════════════════════════
  // STANDARD AUTH STYLES (UNCHANGED)
  // ═══════════════════════════════════════
  kav: { flex: 1, backgroundColor: C.navy },
  brandBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 54 : 36, paddingBottom: 20, backgroundColor: C.navy },
  brandName: { fontSize: 22, fontWeight: '800', color: C.white, letterSpacing: 0.3, flex: 1 },
  scrollMain: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 36 },
  scrollPad: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },
  cornerTL: { position: 'absolute', top: -10, left: -10, width: 80, height: 80, borderRadius: 20, backgroundColor: C.navyMid, opacity: 0.35, transform: [{ rotate: '15deg' }] },
  cornerBR: { position: 'absolute', bottom: 20, right: -20, width: 100, height: 100, borderRadius: 24, backgroundColor: C.navyMid, opacity: 0.25, transform: [{ rotate: '-20deg' }] },
  accentStrip: { height: 6, backgroundColor: C.navy, borderRadius: 3, marginBottom: 30, width: 60, alignSelf: 'center' },
  card: { backgroundColor: C.white, borderRadius: 24, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12, marginTop: 8 },
  tabRow: { flexDirection: 'row', gap: 8, backgroundColor: C.fog, borderRadius: 14, padding: 4, marginBottom: 24 },
  tabPill: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 11 },
  tabPillActive: { backgroundColor: C.navy, shadowColor: C.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  tabText: { fontSize: 14, fontWeight: '600', color: C.ghost },
  tabTextActive: { color: C.white, fontWeight: '700' },
  authHeader: { marginBottom: 24 },
  authTitle: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  authSub: { fontSize: 14, color: C.ghost, marginTop: 5, lineHeight: 20 },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.ghost, letterSpacing: 1.5, marginBottom: 10 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleCard: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: C.mist, backgroundColor: C.fog, alignItems: 'center', position: 'relative' },
  roleCardActive: { borderColor: C.navy, backgroundColor: '#EEF0FF' },
  roleIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.mist, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  roleIconBoxActive: { backgroundColor: C.navy },
  roleTitle: { fontSize: 14, fontWeight: '700', color: C.ghost, marginBottom: 2 },
  roleSub: { fontSize: 11, color: C.ghost, fontWeight: '500' },
  roleCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.mist },
  dividerText: { fontSize: 11, color: C.ghost, fontWeight: '600', letterSpacing: 0.8 },
  floatWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.fog, borderRadius: 14, borderWidth: 1.5, borderColor: C.mist, height: 58, paddingHorizontal: 14 },
  floatIcon: { marginRight: 10 },
  floatInner: { flex: 1, justifyContent: 'center' },
  floatLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 1 },
  floatInput: { fontSize: 15, color: C.ink, paddingTop: 4, height: 36 },
  eyeBtn: { padding: 4 },
  forgotRow: { alignSelf: 'flex-end', marginTop: 12, marginBottom: 2 },
  forgotText: { fontSize: 13, color: C.navy, fontWeight: '700' },
  primaryBtn: { backgroundColor: C.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 14, marginTop: 22, shadowColor: C.navy, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  ghostBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  ghostBtnText: { fontSize: 14, color: C.ghost, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  switchText: { fontSize: 14, color: C.ghost },
  switchLink: { fontSize: 14, color: C.navy, fontWeight: '800' },
  cardHeader: { alignItems: 'center', marginBottom: 28 },
  headerBadge: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  cardSub: { fontSize: 13, color: C.ghost, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  fullCenter: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30 },
  bannedBlock: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.38, backgroundColor: C.navy },
  bannedCard: { backgroundColor: C.white, borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 10 },
  bannedIconRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 3, borderColor: '#FECACA' },
  bannedTitle: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 10 },
  bannedBody: { fontSize: 15, color: C.ghost, textAlign: 'center', lineHeight: 22 },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, borderWidth: 2, borderColor: C.ink, marginTop: 24 },
  outlineBtnText: { fontSize: 15, fontWeight: '700', color: C.ink },
});