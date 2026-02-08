import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch, 
  ActivityIndicator, SafeAreaView, Platform, Modal, TextInput, 
  KeyboardAvoidingView, ScrollView, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics'; 

// --- THEME ---
const COLORS = {
  primary: '#130f5f', dark: '#111827', white: '#FFFFFF',
  gray: '#9CA3AF', lightGray: '#F3F4F6', danger: '#f31111',
  success: '#10B981',
  cardShadow: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }
};

// ✨ FANCY ALERT COMPONENT
const CustomAlert = ({ visible, title, message, onCancel, onConfirm, type = 'danger' }) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true })
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.alertOverlay}>
        <Animated.View style={[styles.alertContainer, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <View style={[styles.alertIconCircle, { backgroundColor: type === 'danger' ? '#FEF2F2' : '#EFF6FF' }]}>
            <Ionicons name={type === 'danger' ? "log-out" : "information-circle"} size={32} color={type === 'danger' ? COLORS.danger : COLORS.primary} />
          </View>
          <Text style={styles.alertTitle}>{title}</Text>
          <Text style={styles.alertMessage}>{message}</Text>
          <View style={styles.alertBtnRow}>
            <TouchableOpacity style={styles.alertBtnCancel} onPress={onCancel}>
              <Text style={styles.alertBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.alertBtnConfirm, { backgroundColor: type === 'danger' ? COLORS.danger : COLORS.primary }]} onPress={onConfirm}>
              <Text style={styles.alertBtnConfirmText}>{type === 'danger' ? "Sign Out" : "Confirm"}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default function SettingsScreen() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // --- MODAL STATES ---
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [logoutAlertVisible, setLogoutAlertVisible] = useState(false); 
  
  // --- FORM STATES ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // --- 1. LOAD PROFILE ---
  useFocusEffect(
    useCallback(() => { fetchProfile(); }, [])
  );

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log("No authenticated user found.");
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
      }
    } catch (e) {
      console.log("Unexpected error:", e);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. ACTIONS ---
  const handleUpdateProfile = async () => {
    if (!firstName) return Alert.alert("Error", "First Name is required.");
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', profile?.id);

      if (error) throw error;
      
      setProfile(prev => ({ ...prev, first_name: firstName, last_name: lastName }));
      setEditProfileVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) { 
      Alert.alert("Error", err.message); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) return Alert.alert("Weak Password", "Must be at least 6 characters.");
    if (newPassword !== confirmPassword) return Alert.alert("Mismatch", "Passwords do not match.");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordVisible(false); setNewPassword(''); setConfirmPassword('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password changed successfully!");
    } catch (err) { Alert.alert("Error", err.message); } 
    finally { setSaving(false); }
  };

  const toggleNotifications = async (value) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setProfile(prev => ({ ...prev, notifications_enabled: value }));
    if (profile?.id) {
        try {
          await supabase.from('profiles').update({ notifications_enabled: value }).eq('id', profile.id);
        } catch (error) {
          console.log(error);
        }
    }
  };

  // --- 📸 AVATAR UPLOAD (FIXED) ---
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Permission Denied", "We need access to photos.");

      let result = await ImagePicker.launchImageLibraryAsync({
        // 🛑 FIXED: Reverted to MediaTypeOptions to prevent crash
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true, 
        aspect: [1, 1], 
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadAvatar(result.assets[0].uri);
      }
    } catch (e) {
      console.log("Picker Error", e);
    }
  };

  const uploadAvatar = async (uri) => {
    if (!profile?.id) return;
    try {
      setUploading(true);

      // 1. Get file extension
      const fileExt = uri.split('.').pop().toLowerCase();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 2. ⚡️ MODERN UPLOAD (Fetch instead of FileSystem)
      // This is faster and doesn't require the deprecated readAsStringAsync
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      // 3. Upload to Supabase
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, { 
            contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`, 
            upsert: true 
        });

      if (uploadError) throw uploadError;

      // 4. Get Public URL
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      // 5. Update Profile
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      
      setProfile(prev => ({ ...prev, avatar_url: `${publicUrl}?t=${Date.now()}` })); 
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Upload Failed", error.message || "Check your internet connection.");
      console.error(error);
    } finally { setUploading(false); }
  };

  const handleLogoutConfirm = () => {
    setLogoutAlertVisible(false);
    supabase.auth.signOut();
  };

  if (loading && !profile) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.placeholderAvatar]}>
                <Text style={styles.initials}>
                  {profile?.first_name ? profile.first_name[0].toUpperCase() : "U"}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.editBadge} onPress={pickImage} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={14} color="#fff" />}
            </TouchableOpacity>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>
              {profile ? `${profile.first_name} ${profile.last_name}` : "User"}
            </Text>
            <Text style={styles.role}>
              {profile?.role ? profile.role.toUpperCase() : "MEMBER"} • {profile?.store_name || "No Store"}
            </Text>
            <View style={styles.statusBadge}><View style={styles.statusDot} /><Text style={styles.statusText}>Active</Text></View>
          </View>
        </View>

        {/* ACCOUNT SETTINGS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <TouchableOpacity style={styles.row} onPress={() => setEditProfileVisible(true)}>
            <View style={styles.rowIcon}><Ionicons name="person-outline" size={20} color={COLORS.dark} /></View>
            <Text style={styles.rowText}>Edit Profile Details</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => setPasswordVisible(true)}>
            <View style={styles.rowIcon}><Ionicons name="lock-closed-outline" size={20} color={COLORS.dark} /></View>
            <Text style={styles.rowText}>Change Password</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="notifications-outline" size={20} color={COLORS.dark} /></View>
            <Text style={styles.rowText}>Notifications</Text>
            <Switch 
              trackColor={{ false: "#767577", true: COLORS.primary }} 
              thumbColor={Platform.OS === 'ios' ? '#fff' : '#f4f3f4'} 
              value={profile?.notifications_enabled ?? true} 
              onValueChange={toggleNotifications} 
            />
          </View>
        </View>

        {/* APP INFO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Info</Text>
          <View style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name="information-circle-outline" size={20} color={COLORS.dark} /></View>
            <Text style={styles.rowText}>Version</Text>
            <Text style={styles.versionText}>1.0.3</Text>
          </View>
        </View>

        {/* LOGOUT BUTTON */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutAlertVisible(true)}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ✨ FANCY LOGOUT ALERT */}
      <CustomAlert 
        visible={logoutAlertVisible} 
        title="Sign Out?" 
        message="Are you sure you want to sign out of your account?" 
        onCancel={() => setLogoutAlertVisible(false)}
        onConfirm={handleLogoutConfirm}
        type="danger"
      />

      {/* --- EDIT PROFILE MODAL --- */}
      <Modal visible={editProfileVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditProfileVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>First Name</Text>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
            <Text style={styles.label}>Last Name</Text>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- CHANGE PASSWORD MODAL --- */}
      <Modal visible={passwordVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPasswordVisible(false)}><Ionicons name="close" size={24} color={COLORS.gray} /></TouchableOpacity>
            </View>
            <Text style={styles.label}>New Password</Text>
            <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 6 characters" />
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Re-type password" />
            <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: COLORS.dark },
  content: { padding: 20 },
  
  // PROFILE CARD
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 20, borderRadius: 20, marginBottom: 25, ...COLORS.cardShadow },
  avatarContainer: { position: 'relative', marginRight: 15 },
  avatar: { width: 70, height: 70, borderRadius: 35 },
  placeholderAvatar: { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  initials: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  role: { fontSize: 12, color: COLORS.gray, marginTop: 2, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DEF7EC', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success, marginRight: 5 },
  statusText: { fontSize: 10, color: '#03543F', fontWeight: 'bold' },
  
  // SECTIONS
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.gray, marginBottom: 10, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 16, borderRadius: 12, marginBottom: 8 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.lightGray, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  rowText: { flex: 1, fontSize: 15, color: COLORS.dark, fontWeight: '500' },
  versionText: { color: COLORS.gray, fontSize: 14 },
  
  // LOGOUT
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, marginTop: 10 },
  logoutText: { color: COLORS.danger, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  
  // MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: 350 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark },
  label: { fontSize: 12, fontWeight: 'bold', color: COLORS.gray, marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', color: COLORS.dark, fontSize: 16 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // ✨ FANCY ALERT STYLES
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alertContainer: { backgroundColor: '#fff', width: '100%', maxWidth: 320, borderRadius: 24, padding: 24, alignItems: 'center', ...COLORS.cardShadow },
  alertIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  alertTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginBottom: 8, textAlign: 'center' },
  alertMessage: { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  alertBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  alertBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.lightGray, alignItems: 'center' },
  alertBtnCancelText: { fontWeight: 'bold', color: COLORS.gray },
  alertBtnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  alertBtnConfirmText: { fontWeight: 'bold', color: '#fff' },
});