import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, Image, 
  ActivityIndicator, SafeAreaView, Platform, Modal, TextInput, 
  KeyboardAvoidingView, ScrollView, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:          '#0C0E1A',
  surface:     '#141728',
  surfaceUp:   '#1C2038',
  border:      '#252A45',
  gold:        '#F59E0B',
  goldDim:     '#78490A',
  goldBg:      '#2D1E00',
  goldSoft:    '#FEF3C7',
  textPrimary: '#F0F2FF',
  textMuted:   '#4A5270',
  gray:        '#8892B0',
  danger:      '#EF4444',
  dangerBg:    '#2D0E0E',
  success:     '#10B981',
  successBg:   '#052E1F',
  navy:        '#130F5F',
  shadow: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};

const ACCOUNTS_KEY = 'pos_saved_accounts_v1';

// ─── CUSTOM ALERT ─────────────────────────────────────────────────────────────
const CustomAlert = ({ visible, title, message, onCancel, onConfirm, type = 'danger' }) => {
  const scaleAnim  = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.parallel([
        Animated.spring(scaleAnim,  { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const accentColor = type === 'danger' ? C.danger : C.gold;
  const accentBg    = type === 'danger' ? C.dangerBg : C.goldBg;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.alertOverlay, { opacity: opacityAnim }]}>
        <Animated.View style={[styles.alertContainer, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.alertIconRing, { backgroundColor: accentBg, borderColor: accentColor + '44' }]}>
            <Ionicons
              name={type === 'danger' ? 'log-out' : 'information-circle'}
              size={28}
              color={accentColor}
            />
          </View>
          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>
          <View style={styles.alertBtnRow}>
            <TouchableOpacity style={styles.alertBtnCancel} onPress={onCancel}>
              <Text style={styles.alertBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.alertBtnConfirm, { backgroundColor: accentColor }]}
              onPress={onConfirm}
            >
              <Text style={styles.alertBtnConfirmText}>
                {type === 'danger' ? 'Sign Out' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ─── FLOATING INPUT ───────────────────────────────────────────────────────────
const FloatingInput = ({ label, value, onChange, secure = false, keyboardType="default", maxLength }) => {
  const [focused, setFocused] = useState(false);
  const [hidden,  setHidden]  = useState(secure);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 180, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    setFocused(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const borderColor = borderAnim.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.gold] });

  return (
    <Animated.View style={[styles.floatWrap, { borderColor }]}>
      <View style={styles.floatInner}>
        {(focused || (value && value.length > 0)) && (
          <Text style={[styles.floatLabel, { color: focused ? C.gold : C.gray }]}>{label}</Text>
        )}
        <TextInput
          style={styles.floatInput}
          placeholder={!focused && (!value || value.length === 0) ? label : ''}
          placeholderTextColor={C.textMuted}
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          secureTextEntry={hidden}
          autoCapitalize="none"
          keyboardType={keyboardType}
          maxLength={maxLength}
        />
      </View>
      {secure && (
        <TouchableOpacity onPress={() => setHidden(h => !h)} style={{ padding: 4 }}>
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.gray} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// ─── SETTINGS ROW ─────────────────────────────────────────────────────────────
const SettingsRow = ({ icon, label, onPress, chevron = true, rightNode }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.rowIconBox}>
      <Ionicons name={icon} size={18} color={C.gold} />
    </View>
    <Text style={styles.rowText}>{label}</Text>
    {rightNode || (chevron && <Ionicons name="chevron-forward" size={16} color={C.textMuted} />)}
  </TouchableOpacity>
);

// ─── SECTION LABEL ────────────────────────────────────────────────────────────
const SectionLabel = ({ text }) => (
  <View style={styles.sectionLabelRow}>
    <View style={styles.sectionLabelDot} />
    <Text style={styles.sectionLabelText}>{text}</Text>
    <View style={styles.sectionLabelLine} />
  </View>
);

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [passwordVisible,    setPasswordVisible]    = useState(false);
  const [pinModalVisible,    setPinModalVisible]    = useState(false); // 🌟 NEW
  const [logoutAlertVisible, setLogoutAlertVisible] = useState(false);

  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 🌟 PIN SETUP STATES
  const [authPassword, setAuthPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { fetchProfile(); }, []));

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email);

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const { data: memberships } = await supabase
        .from('store_memberships').select('store_name')
        .eq('merchant_id', user.id).eq('status', 'active');

      let assignedStores = data?.store_name;
      if (memberships && memberships.length > 0) {
        assignedStores = memberships.map(m => m.store_name).join(', ');
      }

      if (data) {
        setProfile({ ...data, display_store_name: assignedStores || 'No Store' });
        setFirstName(data.first_name || '');
        setLastName(data.last_name  || '');
      }
    } catch (e) { console.log('Fetch Profile Error:', e); }
    finally { setLoading(false); }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission Denied', 'We need access to photos.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 0.3,
      });
      if (!result.canceled && result.assets?.length > 0) uploadAvatar(result.assets[0]);
    } catch (e) { console.log('Picker Error', e); }
  };

  const uploadAvatar = async (asset) => {
    if (!profile?.id) return;
    try {
      setUploading(true);
      const fileExt = asset.uri.split('.').pop().toLowerCase();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
        name: fileName,
        type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      });
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, formData, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: dbError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      if (dbError) throw dbError;
      setProfile(prev => ({ ...prev, avatar_url: `${publicUrl}?t=${Date.now()}` }));
      
      // Update local storage if they are in the quick login grid
      updateLocalAvatar(publicUrl);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Updated', 'Profile photo changed.');
    } catch (error) {
      Alert.alert('Upload Failed', "Ensure your 'avatars' bucket is PUBLIC in Supabase.");
    } finally { setUploading(false); }
  };

  const updateLocalAvatar = async (url) => {
    const stored = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    if (stored) {
      let parsed = JSON.parse(stored);
      parsed = parsed.map(acc => acc.id === profile.id ? { ...acc, avatar_url: url } : acc);
      await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(parsed));
    }
  };

  const handleUpdateProfile = async () => {
    if (!firstName) return Alert.alert('Error', 'First name is required.');
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ first_name: firstName, last_name: lastName }).eq('id', profile?.id);
      if (error) throw error;
      setProfile(prev => ({ ...prev, first_name: firstName, last_name: lastName }));
      
      // Update local storage name
      const stored = await SecureStore.getItemAsync(ACCOUNTS_KEY);
      if (stored) {
        let parsed = JSON.parse(stored);
        parsed = parsed.map(acc => acc.id === profile.id ? { ...acc, first_name: firstName, last_name: lastName } : acc);
        await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(parsed));
      }

      setEditProfileVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6)      return Alert.alert('Too Short', 'Must be at least 6 characters.');
    if (newPassword !== confirmPassword) return Alert.alert('Mismatch', 'Passwords do not match.');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      // Update local storage password if they have a PIN set up
      const stored = await SecureStore.getItemAsync(ACCOUNTS_KEY);
      if (stored) {
        let parsed = JSON.parse(stored);
        parsed = parsed.map(acc => acc.id === profile.id ? { ...acc, password: newPassword } : acc);
        await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(parsed));
      }

      setPasswordVisible(false); setNewPassword(''); setConfirmPassword('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Done', 'Password updated successfully.');
    } catch (err) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  };

  // 🌟 NEW: SAVE PIN TO DEVICE SECURE STORE
  const handleCreatePin = async () => {
    if (!authPassword) return Alert.alert('Error', 'Current password is required to verify identity.');
    if (newPin.length !== 4) return Alert.alert('Error', 'PIN must be exactly 4 digits.');

    setSaving(true);
    try {
      // 1. Verify their password with Supabase just to be safe
      const { error: authError } = await supabase.auth.signInWithPassword({ email: userEmail, password: authPassword });
      if (authError) throw new Error("Incorrect current password.");

      // 2. Format the new account
      const newAccount = {
        id: profile.id,
        email: userEmail,
        password: authPassword, 
        pin: newPin,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        avatar_url: profile.avatar_url
      };

      // 3. Save to Secure Store
      const stored = await SecureStore.getItemAsync(ACCOUNTS_KEY);
      let parsedAccounts = stored ? JSON.parse(stored) : [];
      
      // Remove them if they already exist, so we can overwrite
      parsedAccounts = parsedAccounts.filter(acc => acc.id !== profile.id);
      parsedAccounts.push(newAccount);

      await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(parsedAccounts));
      
      setPinModalVisible(false);
      setAuthPassword('');
      setNewPin('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Your profile has been pinned to the Lock Screen!');

    } catch (e) {
        Alert.alert('Setup Failed', e.message);
    } finally {
        setSaving(false);
    }
  };

  const handleLogoutConfirm = () => { setLogoutAlertVisible(false); supabase.auth.signOut(); };

  if (loading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }

  const initials = profile?.first_name?.[0]?.toUpperCase() || 'U';

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>ACCOUNT</Text>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card ── */}
        <View style={styles.profileCard}>
          {/* Background decoration */}
          <View style={styles.profileCardBg} />

          <View style={styles.profileCardInner}>
            {/* Avatar */}
            <View style={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <Image
                  key={profile.avatar_url}
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.cameraBadge} onPress={pickImage} disabled={uploading} activeOpacity={0.8}>
                {uploading
                  ? <ActivityIndicator size="small" color={C.navy} />
                  : <Ionicons name="camera" size={13} color={C.navy} />
                }
              </TouchableOpacity>
            </View>

            {/* Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile?.first_name} {profile?.last_name}
              </Text>
              <Text style={styles.profileMeta}>
                {profile?.role?.toUpperCase()} · {profile?.display_store_name}
              </Text>
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>Active Account</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Account Section ── */}
        <SectionLabel text="ACCOUNT" />
        <View style={styles.section}>
          <SettingsRow
            icon="person-outline"
            label="Edit Profile Details"
            onPress={() => setEditProfileVisible(true)}
          />
          <View style={styles.rowDivider} />
          <SettingsRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => setPasswordVisible(true)}
          />
          <View style={styles.rowDivider} />
          {/* 🌟 NEW: CREATE PIN ROW */}
          <SettingsRow
            icon="keypad-outline"
            label="Create Quick Login PIN"
            onPress={() => setPinModalVisible(true)}
          />
        </View>

        {/* ── Danger Zone ── */}
        <SectionLabel text="SESSION" />
        <TouchableOpacity style={styles.signOutBtn} onPress={() => setLogoutAlertVisible(true)} activeOpacity={0.8}>
          <View style={styles.signOutIconBox}>
            <Ionicons name="log-out-outline" size={18} color={C.danger} />
          </View>
          <Text style={styles.signOutText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color={C.danger + '88'} />
        </TouchableOpacity>

        {/* App version footer */}
        <Text style={styles.versionText}>Nexus POS · v1.0.0</Text>
      </ScrollView>

      {/* ── Logout Alert ── */}
      <CustomAlert
        visible={logoutAlertVisible}
        title="Sign Out?"
        message="You'll need to sign in again to access your account."
        onCancel={() => setLogoutAlertVisible(false)}
        onConfirm={handleLogoutConfirm}
        type="danger"
      />

      {/* ── Edit Profile Modal ── */}
      <Modal visible={editProfileVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}>
                <Ionicons name="person" size={18} color={C.gold} />
              </View>
              <Text style={styles.sheetTitle}>Edit Profile</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setEditProfileVisible(false)}>
                <Ionicons name="close" size={18} color={C.gray} />
              </TouchableOpacity>
            </View>

            <FloatingInput label="First Name" value={firstName} onChange={setFirstName} />
            <View style={{ height: 14 }} />
            <FloatingInput label="Last Name"  value={lastName}  onChange={setLastName} />

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleUpdateProfile} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.navy} size="small" />
                : <>
                    <Ionicons name="checkmark" size={18} color={C.navy} />
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={passwordVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}>
                <Ionicons name="lock-closed" size={18} color={C.gold} />
              </View>
              <Text style={styles.sheetTitle}>Change Password</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setPasswordVisible(false)}>
                <Ionicons name="close" size={18} color={C.gray} />
              </TouchableOpacity>
            </View>

            <FloatingInput label="New Password"     value={newPassword}     onChange={setNewPassword}     secure />
            <View style={{ height: 14 }} />
            <FloatingInput label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} secure />

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleChangePassword} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.navy} size="small" />
                : <>
                    <Ionicons name="shield-checkmark" size={18} color={C.navy} />
                    <Text style={styles.saveBtnText}>Update Password</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 🌟 SETUP QUICK PIN MODAL */}
      <Modal visible={pinModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetIconBox}>
                <Ionicons name="keypad" size={18} color={C.gold} />
              </View>
              <Text style={styles.sheetTitle}>Enable Quick Login</Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => {setPinModalVisible(false); setAuthPassword(''); setNewPin('');}}>
                <Ionicons name="close" size={18} color={C.gray} />
              </TouchableOpacity>
            </View>

            <Text style={{color: C.gray, marginBottom: 20, fontSize: 13, lineHeight: 18}}>
              This will add your profile to the Lock Screen grid, allowing you to instantly sign in with a 4-digit PIN instead of your email and password.
            </Text>

            <FloatingInput label="Current Password" value={authPassword} onChange={setAuthPassword} secure />
            <View style={{ height: 14 }} />
            <FloatingInput label="Create 4-Digit PIN" value={newPin} onChange={setNewPin} keyboardType="numeric" maxLength={4} secure />

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleCreatePin} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.navy} size="small" />
                : <>
                    <Ionicons name="checkmark-circle" size={18} color={C.navy} />
                    <Text style={styles.saveBtnText}>Save to Device</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  // ── Header ──
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 12,
    paddingBottom: 20,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '800',
    color: C.textMuted, letterSpacing: 2, marginBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: '900', color: C.gold, letterSpacing: -0.5 },
  headerAccent: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold + '44',
  },

  content: { paddingHorizontal: 20, paddingBottom: 48 },

  // ── Profile Card ──
  profileCard: {
    borderRadius: 22, marginBottom: 32,
    overflow: 'hidden',
    borderWidth: 1, borderColor: C.border,
    ...C.shadow,
  },
  profileCardBg: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 60, backgroundColor: C.goldBg,
  },
  profileCardInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, paddingTop: 28,
    backgroundColor: C.surface,
    marginTop: 32,
  },
  avatarWrap: { position: 'relative', marginRight: 18 },
  avatar: {
    width: 78, height: 78, borderRadius: 22,
    borderWidth: 3, borderColor: C.gold,
  },
  avatarPlaceholder: {
    width: 78, height: 78, borderRadius: 22,
    backgroundColor: C.goldBg,
    borderWidth: 3, borderColor: C.gold,
    justifyContent: 'center', alignItems: 'center',
  },
  initials:  { fontSize: 28, fontWeight: '900', color: C.gold },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: C.gold,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: C.surface,
  },
  profileInfo:  { flex: 1 },
  profileName:  { fontSize: 18, fontWeight: '900', color: C.gold, letterSpacing: -0.3 },
  profileMeta:  { fontSize: 11, color: C.gray, fontWeight: '600', marginTop: 3 },
  activePill: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: C.successBg,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1, borderColor: C.success + '44',
  },
  activeDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success, marginRight: 6 },
  activeText: { fontSize: 10, fontWeight: '700', color: C.success },

  // ── Section Label ──
  sectionLabelRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionLabelDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold },
  sectionLabelText: { fontSize: 10, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5 },
  sectionLabelLine: { flex: 1, height: 1, backgroundColor: C.border },

  // ── Settings Section ──
  section: {
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 24, overflow: 'hidden',
    ...C.shadow,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 18,
  },
  rowIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold + '44',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: C.gold },
  rowDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 18 },

  // ── Sign Out ──
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.dangerBg, borderRadius: 18,
    padding: 18, marginBottom: 24,
    borderWidth: 1, borderColor: C.danger + '44',
    ...C.shadow,
  },
  signOutIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.danger + '22', borderWidth: 1, borderColor: C.danger + '44',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  signOutText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.danger },

  versionText: { textAlign: 'center', fontSize: 11, color: C.textMuted, marginTop: 8 },

  // ── Alert ──
  alertOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', padding: 30,
  },
  alertContainer: {
    backgroundColor: C.surface, width: '100%',
    borderRadius: 24, padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 12,
  },
  alertIconRing: {
    width: 64, height: 64, borderRadius: 20,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  alertTitle:   { fontSize: 20, fontWeight: '900', color: C.gold, marginBottom: 8 },
  alertMessage: { fontSize: 13, color: C.gray, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  alertBtnRow:  { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtnCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.surfaceUp, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  alertBtnCancelText: { fontWeight: '700', color: C.gray, fontSize: 14 },
  alertBtnConfirm:    { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  alertBtnConfirmText:{ fontWeight: '800', color: C.navy, fontSize: 14 },

  // ── Bottom Sheet ──
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36,
    borderWidth: 1, borderColor: C.border, borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: C.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  sheetHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24,
  },
  sheetIconBox: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: C.goldBg, borderWidth: 1, borderColor: C.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: C.gold },
  sheetCloseBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.surfaceUp, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },

  // ── Floating Input ──
  floatWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surfaceUp, borderRadius: 14,
    borderWidth: 1.5, paddingHorizontal: 16, height: 58,
  },
  floatInner: { flex: 1, justifyContent: 'center' },
  floatLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1 },
  floatInput: { fontSize: 15, color: C.gold, paddingTop: 2 },

  // ── Save Button ──
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: C.gold,
    paddingVertical: 16, borderRadius: 14, marginTop: 24,
    shadowColor: C.gold, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { fontSize: 16, fontWeight: '900', color: C.navy },
});