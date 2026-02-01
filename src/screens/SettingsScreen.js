import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, Image, Switch, 
  ActivityIndicator, SafeAreaView, Platform, Modal, TextInput, 
  KeyboardAvoidingView, ScrollView // <--- Added ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

// --- THEME ---
const COLORS = {
  primary: '#130f5f',
  dark: '#111827',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  lightGray: '#F3F4F6',
  danger: '#f31111',
  success: '#10B981',
};

export default function SettingsScreen() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // --- MODAL STATES ---
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  
  // --- FORM STATES ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // --- 1. LOAD PROFILE ---
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(data);
      setFirstName(data?.first_name || '');
      setLastName(data?.last_name || '');
    }
    setLoading(false);
  };

  // --- 2. ACTIONS ---
  const handleUpdateProfile = async () => {
    if (!firstName) return Alert.alert("Error", "First Name is required.");
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', profile.id);

      if (error) throw error;
      
      setProfile({ ...profile, first_name: firstName, last_name: lastName });
      setEditProfileVisible(false);
      Alert.alert("Success", "Profile updated successfully!");
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
      
      setPasswordVisible(false);
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert("Success", "Password changed successfully!");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleNotifications = async (value) => {
    setProfile(prev => ({ ...prev, notifications_enabled: value }));
    try {
      await supabase
        .from('profiles')
        .update({ notifications_enabled: value })
        .eq('id', profile.id);
    } catch (error) {
      console.log("Failed to save preference", error);
      setProfile(prev => ({ ...prev, notifications_enabled: !value }));
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission Denied", "We need access to photos.");

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });

    if (!result.canceled) uploadAvatar(result.assets[0].uri);
  };

  const uploadAvatar = async (uri) => {
    try {
      setUploading(true);
      const fileExt = uri.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append('file', { uri, name: fileName, type: `image/${fileExt}` });

      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, formData, { contentType: `image/${fileExt}` });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      
      // Force UI refresh with new timestamp
      setProfile({ ...profile, avatar_url: `${publicUrl}?t=${new Date().getTime()}` });
      
      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => supabase.auth.signOut() }
    ]);
  };

  if (loading && !profile) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* ✅ Changed View to ScrollView so Logout button is reachable */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.placeholderAvatar]}>
                <Text style={styles.initials}>{profile?.first_name?.[0]?.toUpperCase() || "U"}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.editBadge} onPress={pickImage} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{profile?.first_name} {profile?.last_name}</Text>
            <Text style={styles.role}>{profile?.role?.toUpperCase()} • {profile?.store_name || "No Store"}</Text>
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
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Extra padding at bottom to ensure scrolling covers button */}
        <View style={{ height: 40 }} />

      </ScrollView>

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
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 20, borderRadius: 20, marginBottom: 25, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  avatarContainer: { position: 'relative', marginRight: 15 },
  avatar: { width: 70, height: 70, borderRadius: 35 },
  placeholderAvatar: { backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  initials: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
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
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, minHeight: 300 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  label: { fontSize: 12, fontWeight: 'bold', color: COLORS.gray, marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#F3F4F6', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', color: COLORS.dark },
  saveBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});