import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, SafeAreaView 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase'; 

export default function ChangePasswordScreen({ onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // 1. Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found.");

      // 2. Update Password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ 
        password: newPassword 
      });

      if (authError) throw authError;

      // 3. CRITICAL: Update the Profile to mark user as "Not New"
      // This stops the screen from appearing again.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_new_user: false }) // ✅ This is the key fix
        .eq('id', user.id);

      if (profileError) {
        console.log("Profile update warning:", profileError.message);
        // We continue anyway because the password DID change.
      }

      // 4. Success & Redirect
      Alert.alert("Success", "Password updated! Logging you in...", [
        { 
          text: "OK", 
          onPress: () => {
            // Trigger the callback to tell App.js to re-check the user status
            if (onPasswordChanged) onPasswordChanged(); 
          }
        }
      ]);

    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed" size={40} color="#4F46E5" />
        </View>
        <Text style={styles.title}>Setup New Password</Text>
        <Text style={styles.subtitle}>
          For your security, please create a new password for your account.
        </Text>

        <View style={styles.inputContainer}>
          <Ionicons name="key-outline" size={20} color="#9CA3AF" style={{marginRight: 10}} />
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
          <Ionicons name="checkmark-circle-outline" size={20} color="#9CA3AF" style={{marginRight: 10}} />
          <TextInput 
            style={styles.input} 
            placeholder="Confirm Password" 
            secureTextEntry 
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleChangePassword}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Update & Login</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 20, alignItems: 'center', shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 30 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 15, height: 50, marginBottom: 15, width: '100%' },
  input: { flex: 1, fontSize: 16, color: '#111827' },
  button: { backgroundColor: '#4F46E5', width: '100%', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});