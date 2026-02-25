import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions, Animated, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

// ─── 💎 PREMIUM DESIGN TOKENS ─────────────────────────────────────────────
const C = {
  bg:          '#0A0D14', // Deep Space Blue
  surface:     '#131722', 
  surfaceUp:   '#1A1F2E', 
  border:      '#232A3B', 
  gold:        '#FFB800', // Vibrant Gold
  danger:      '#FF4A4A',
  textPrimary: '#FFFFFF',
  textSec:     '#94A3B8',
  textMuted:   '#64748B',
  glow: { shadowColor: '#FFB800', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 10 },
};

const ACCOUNTS_KEY = 'pos_saved_accounts_v1';

export default function LoginScreen() {
  const [view, setView] = useState('loading'); // 'loading', 'accounts', 'login', 'create_pin', 'enter_pin'
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // PIN State
  const [pin, setPin] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ─── INITIALIZATION ───
  useEffect(() => {
    loadSavedAccounts();
  }, []);

  const loadSavedAccounts = async () => {
    try {
      const stored = await SecureStore.getItemAsync(ACCOUNTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSavedAccounts(parsed);
        setView(parsed.length > 0 ? 'accounts' : 'login');
      } else {
        setView('login');
      }
    } catch (e) {
      setView('login');
    }
  };

  const triggerShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  // ─── PIN LOGIC ───
  useEffect(() => {
    if (pin.length === 4) {
      if (view === 'create_pin') executeNewLogin();
      if (view === 'enter_pin') executePinLogin();
    }
  }, [pin]);

  const handleNumpadPress = (num) => {
    if (pin.length < 4) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPin(prev => prev + num);
      setErrorMsg('');
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPin(prev => prev.slice(0, -1));
      setErrorMsg('');
    }
  };

  // ─── LOGIN FLOWS ───
  const startNewLoginFlow = () => {
    if (!email || !password) return setErrorMsg("Please fill in both fields.");
    setErrorMsg('');
    setPin('');
    setView('create_pin');
  };

  const executeNewLogin = async () => {
    setLoading(true);
    try {
      // 1. Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      // 2. Fetch Profile to get Name & Avatar
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();

      // 3. Save securely to device
      const newAccount = {
        id: authData.user.id,
        email: email,
        password: password, 
        pin: pin,
        first_name: profile?.first_name || 'User',
        last_name: profile?.last_name || '',
        role: profile?.role || 'merchant',
        avatar_url: profile?.avatar_url
      };

      // Ensure we don't duplicate the same account
      const filteredAccounts = savedAccounts.filter(acc => acc.id !== newAccount.id);
      const updatedAccounts = [...filteredAccounts, newAccount];
      
      await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
      setSavedAccounts(updatedAccounts);
      
      // Note: App.js will automatically detect the auth state change and unmount this screen.
    } catch (error) {
      triggerShake();
      setErrorMsg(error.message);
      setPin('');
      setView('login'); // Send them back to fix credentials
    } finally {
      setLoading(false);
    }
  };

  const executePinLogin = async () => {
    if (!selectedAccount) return;
    setLoading(true);

    if (pin === selectedAccount.pin) {
      try {
        const { error } = await supabase.auth.signInWithPassword({ 
          email: selectedAccount.email, 
          password: selectedAccount.password 
        });
        if (error) throw error;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // App.js takes over from here!
      } catch (error) {
        triggerShake();
        setErrorMsg("Authentication failed. Password may have changed.");
        setPin('');
        setLoading(false);
      }
    } else {
      triggerShake();
      setErrorMsg("Incorrect PIN");
      setPin('');
      setLoading(false);
    }
  };

  const removeAccount = async (idToRemove) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = savedAccounts.filter(acc => acc.id !== idToRemove);
    await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(updated));
    setSavedAccounts(updated);
    if (updated.length === 0) setView('login');
  };

  // ─── RENDERERS ───
  if (view === 'loading') {
    return <View style={styles.container}><ActivityIndicator color={C.gold} size="large" /></View>;
  }

  // 1. SAVED ACCOUNTS GRID
  if (view === 'accounts') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Welcome to Nexus</Text>
          <Text style={styles.subtitle}>Select your profile to begin shift</Text>
        </View>

        <View style={styles.grid}>
          {savedAccounts.map(acc => (
            <View key={acc.id} style={styles.accountCardWrapper}>
              <TouchableOpacity 
                style={styles.accountCard} 
                activeOpacity={0.8}
                onPress={() => { setSelectedAccount(acc); setPin(''); setErrorMsg(''); setView('enter_pin'); }}
              >
                <View style={styles.avatarBox}>
                  {acc.avatar_url ? (
                    <Image source={{uri: acc.avatar_url}} style={{width:'100%', height:'100%'}} />
                  ) : (
                    <Text style={styles.avatarInitials}>{acc.first_name?.[0]}</Text>
                  )}
                </View>
                <Text style={styles.accountName} numberOfLines={1}>{acc.first_name}</Text>
                <Text style={styles.accountRole}>{acc.role.toUpperCase()}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.removeBtn} onPress={() => removeAccount(acc.id)}>
                <Ionicons name="close" size={14} color={C.white} />
              </TouchableOpacity>
            </View>
          ))}
          
          <TouchableOpacity style={[styles.accountCard, {backgroundColor: 'transparent', borderWidth: 2, borderColor: C.border, borderStyle: 'dashed'}]} onPress={() => { setEmail(''); setPassword(''); setErrorMsg(''); setView('login'); }}>
            <View style={[styles.avatarBox, {backgroundColor: C.surfaceUp}]}>
              <Ionicons name="add" size={30} color={C.textMuted} />
            </View>
            <Text style={[styles.accountName, {color: C.textMuted}]}>Add New</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // 2. PIN PAD VIEW (For both Creating and Entering)
  if (view === 'create_pin' || view === 'enter_pin') {
    const isEntering = view === 'enter_pin';
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <TouchableOpacity style={styles.backBtn} onPress={() => setView(savedAccounts.length > 0 ? 'accounts' : 'login')}>
            <Ionicons name="arrow-back" size={24} color={C.gold} />
        </TouchableOpacity>

        <Animated.View style={[styles.pinHeader, { transform: [{ translateX: shakeAnim }] }]}>
            {isEntering && selectedAccount ? (
               <View style={styles.pinAvatarSmall}>
                 {selectedAccount.avatar_url ? <Image source={{uri: selectedAccount.avatar_url}} style={{width:'100%', height:'100%'}} /> : <Text style={styles.avatarInitialsSmall}>{selectedAccount.first_name?.[0]}</Text>}
               </View>
            ) : (
               <View style={[styles.pinAvatarSmall, {backgroundColor: C.surfaceUp}]}><Ionicons name="lock-closed" size={24} color={C.gold} /></View>
            )}
            
            <Text style={styles.title}>{isEntering ? `Welcome, ${selectedAccount?.first_name}` : "Create Quick PIN"}</Text>
            <Text style={styles.subtitle}>{isEntering ? "Enter your 4-digit PIN to login" : "Enter a 4-digit PIN for future quick logins"}</Text>

            <View style={styles.dotsContainer}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled, errorMsg ? {borderColor: C.danger, backgroundColor: pin.length > i ? C.danger : 'transparent'} : null]} />
              ))}
            </View>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        </Animated.View>

        <View style={styles.numpad}>
          {[[1,2,3], [4,5,6], [7,8,9]].map((row, rIdx) => (
            <View key={rIdx} style={styles.numRow}>
              {row.map(num => (
                <TouchableOpacity key={num} style={styles.numBtn} onPress={() => handleNumpadPress(num.toString())}>
                  <Text style={styles.numText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={styles.numRow}>
            <View style={styles.numBtnEmpty} />
            <TouchableOpacity style={styles.numBtn} onPress={() => handleNumpadPress('0')}>
              <Text style={styles.numText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.numBtn} onPress={handleBackspace}>
              <Ionicons name="backspace-outline" size={28} color={C.textSec} />
            </TouchableOpacity>
          </View>
        </View>

        {loading && (
            <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={C.gold} />
                <Text style={{color: C.gold, marginTop: 10, fontWeight: 'bold'}}>Authenticating...</Text>
            </View>
        )}
      </View>
    );
  }

  // 3. STANDARD LOGIN (EMAIL/PASS)
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.loginFormContainer}>
        
        {savedAccounts.length > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setView('accounts')}>
                <Ionicons name="arrow-back" size={24} color={C.gold} />
            </TouchableOpacity>
        )}

        <View style={{alignItems: 'center', marginBottom: 40}}>
            <View style={styles.logoBox}><Ionicons name="cube" size={40} color={C.gold} /></View>
            <Text style={styles.title}>Nexus POS</Text>
            <Text style={styles.subtitle}>Sign in with Email to add your profile</Text>
        </View>

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput 
            style={styles.input} 
            placeholder="admin@store.com" 
            placeholderTextColor={C.textMuted}
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput 
            style={styles.input} 
            placeholder="••••••••" 
            placeholderTextColor={C.textMuted}
            value={password} 
            onChangeText={setPassword} 
            secureTextEntry 
          />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={startNewLoginFlow} disabled={loading}>
          {loading ? <ActivityIndicator color={C.bg} /> : <Text style={styles.primaryBtnText}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'center' },
  
  headerBlock: { alignItems: 'center', marginTop: Platform.OS === 'android' ? 60 : 80, marginBottom: 40 },
  title: { fontSize: 26, fontWeight: '900', color: C.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textSec },

  // ACCOUNTS GRID
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20, paddingHorizontal: 20 },
  accountCardWrapper: { position: 'relative' },
  accountCard: {
    backgroundColor: C.surface, width: (width / 2) - 30, paddingVertical: 24, paddingHorizontal: 10,
    borderRadius: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border, ...C.glow
  },
  avatarBox: { width: 70, height: 70, borderRadius: 25, backgroundColor: C.goldBg, alignItems: 'center', justifyContent: 'center', marginBottom: 15, borderWidth: 2, borderColor: C.gold + '55', overflow: 'hidden' },
  avatarInitials: { color: C.gold, fontSize: 28, fontWeight: '900' },
  accountName: { color: C.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  accountRole: { color: C.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  removeBtn: { position: 'absolute', top: -5, right: -5, width: 26, height: 26, backgroundColor: C.border, borderRadius: 13, alignItems: 'center', justifyContent: 'center', zIndex: 10, borderWidth: 2, borderColor: C.bg },

  // PIN PAD
  pinHeader: { alignItems: 'center', marginBottom: 50, marginTop: 40 },
  pinAvatarSmall: { width: 60, height: 60, borderRadius: 20, backgroundColor: C.goldBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.gold + '44' },
  avatarInitialsSmall: { color: C.gold, fontSize: 24, fontWeight: '900' },
  dotsContainer: { flexDirection: 'row', gap: 16, marginTop: 30 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.textMuted, backgroundColor: 'transparent' },
  dotFilled: { borderColor: C.gold, backgroundColor: C.gold, shadowColor: C.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8 },
  
  numpad: { paddingHorizontal: 40, gap: 15, paddingBottom: 50 },
  numRow: { flexDirection: 'row', justifyContent: 'space-between' },
  numBtn: { width: 75, height: 75, borderRadius: 38, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  numBtnEmpty: { width: 75, height: 75 },
  numText: { fontSize: 32, fontWeight: '500', color: C.textPrimary },

  // LOGIN FORM
  loginFormContainer: { paddingHorizontal: 30, width: '100%', maxWidth: 400, alignSelf: 'center' },
  logoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.goldBg, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: C.gold + '55', ...C.glow },
  inputGroup: { marginBottom: 20 },
  label: { color: C.textSec, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: C.surface, height: 60, borderRadius: 16, paddingHorizontal: 20, color: C.textPrimary, fontSize: 16, borderWidth: 1, borderColor: C.border },
  
  primaryBtn: { backgroundColor: C.gold, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10, ...C.glow },
  primaryBtnText: { color: C.bg, fontSize: 17, fontWeight: '900' },
  
  backBtn: { position: 'absolute', top: Platform.OS === 'android' ? 50 : 60, left: 20, zIndex: 10, width: 44, height: 44, backgroundColor: C.surface, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  
  errorText: { color: C.danger, textAlign: 'center', marginBottom: 15, fontWeight: '600' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 13, 20, 0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }
});