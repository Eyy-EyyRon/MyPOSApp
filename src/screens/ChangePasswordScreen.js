import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, SafeAreaView, Modal, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase'; 

// Color Palette matching your app theme
const COLORS = {
  primary: '#4F46E5',    // Indigo
  success: '#10B981',    // Emerald Green
  dark: '#111827',
  gray: '#6B7280',
  bg: '#F3F4F6',
  white: '#FFFFFF'
};

export default function ChangePasswordScreen({ onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false); // 🌟 New State for Custom Modal

  const handleChangePassword = async () => {
    if (newPassword.length < 6) return Alert.alert("Weak Password", "Min 6 characters.");
    if (newPassword !== confirmPassword) return Alert.alert("Mismatch", "Passwords do not match.");

    setLoading(true);

    try {
      // 1. Get Current User
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found. Please login again.");

      // 2. Update Password in Auth
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) throw authError;

      // 3. Update Profile Logic (Flip the switch)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_new_user: false, must_change_password: false })
        .eq('id', user.id);

      if (profileError) {
        // Fallback: Try the server function if direct update fails
        const { error: rpcError } = await supabase.rpc('complete_first_login');
        if (rpcError) console.log("RPC update warning", rpcError);
      }

      // 4. ✨ SHOW THE PRETTY MODAL INSTEAD OF ALERT
      setShowSuccessModal(true);

    } catch (error) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLetsGo = () => {
    setShowSuccessModal(false);
    if (onPasswordChanged) onPasswordChanged(); 
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* --- MAIN CARD --- */}
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed" size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Setup New Password</Text>
        <Text style={styles.subtitle}>
          For your security, please create a new password to continue.
        </Text>

        <View style={styles.inputContainer}>
          <Ionicons name="key-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput 
            style={styles.input} 
            placeholder="New Password" 
            secureTextEntry 
            value={newPassword} 
            onChangeText={setNewPassword} 
            placeholderTextColor="#9CA3AF" 
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
          <TextInput 
            style={styles.input} 
            placeholder="Confirm Password" 
            secureTextEntry 
            value={confirmPassword} 
            onChangeText={setConfirmPassword} 
            placeholderTextColor="#9CA3AF" 
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleChangePassword} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Update & Login</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* --- ✨ PRETTY SUCCESS MODAL --- */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successCard}>
            
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={50} color={COLORS.white} />
            </View>

            <Text style={styles.successTitle}>All Set!</Text>
            <Text style={styles.successBody}>
              Your password has been updated successfully. You are ready to start selling.
            </Text>

            <TouchableOpacity style={styles.letsGoBtn} onPress={handleLetsGo}>
              <Text style={styles.letsGoText}>Let's Go</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', padding: 20 },
  
  // Main Card Styles
  card: { 
    backgroundColor: COLORS.white, 
    padding: 30, 
    borderRadius: 24, 
    alignItems: 'center', 
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 
  },
  iconContainer: { 
    width: 80, height: 80, borderRadius: 40, 
    backgroundColor: '#EEF2FF', 
    justifyContent: 'center', alignItems: 'center', marginBottom: 20 
  },
  title: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', marginBottom: 30, paddingHorizontal: 10, lineHeight: 20 },
  
  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', 
    borderRadius: 16, paddingHorizontal: 15, height: 55, marginBottom: 15, width: '100%' 
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: COLORS.dark },
  
  button: { 
    backgroundColor: COLORS.primary, width: '100%', height: 55, 
    borderRadius: 16, justifyContent: 'center', alignItems: 'center', 
    marginTop: 10, shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5
  },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: 'bold' },

  // ✨ Success Modal Styles
  modalOverlay: { 
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', 
    justifyContent: 'center', alignItems: 'center', padding: 20 
  },
  successCard: { 
    backgroundColor: COLORS.white, width: '100%', maxWidth: 340, 
    borderRadius: 30, padding: 30, alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10
  },
  successIconCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
    shadowColor: COLORS.success, shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10
  },
  successTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.dark, marginBottom: 10 },
  successBody: { fontSize: 15, color: COLORS.gray, textAlign: 'center', marginBottom: 30, lineHeight: 22 },
  
  letsGoBtn: {
    backgroundColor: COLORS.dark, 
    width: '100%', paddingVertical: 18, borderRadius: 18,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5
  },
  letsGoText: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' }
});