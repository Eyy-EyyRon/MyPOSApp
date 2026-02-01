import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar 
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#08045e', 
  success: '#1ccf15',
  bg: '#F9FAFB',
  white: '#FFFFFF',
  text: '#1F2937',
  gray: '#9CA3AF'
};

export default function ChangePasswordScreen({ onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      // 1. Update Password in Auth
      const { error: authError } = await supabase.auth.updateUser({ 
        password: newPassword 
      });

      if (authError) throw authError;

      // 2. Update Profile to unlock the account
      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ 
          must_change_password: false, // <--- UNLOCKS THE APP
          is_password_changed: true 
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      Alert.alert("Success", "Password updated successfully!");
      onPasswordChanged(); 

    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.card}>
        <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={48} color={COLORS.success} />
        </View>
        
        <Text style={styles.title}>Setup Security</Text>
        <Text style={styles.subtitle}>
          Please set a new personal password to continue.
        </Text>

        {/* STANDARD TEXT INPUT (Safe to use) */}
        <TextInput 
          style={styles.input} 
          placeholder="New Password" 
          placeholderTextColor={COLORS.gray}
          secureTextEntry 
          value={newPassword}
          onChangeText={setNewPassword}
        />

        <TouchableOpacity style={styles.button} onPress={handleChange} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Update Password & Login</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: COLORS.white, padding: 30, borderRadius: 20, elevation: 5, alignItems: 'center' },
  iconContainer: { marginBottom: 20, backgroundColor: '#E8F5E9', padding: 15, borderRadius: 50 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.text, textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  input: { 
    backgroundColor: '#F3F4F6', width: '100%', padding: 15, borderRadius: 12, 
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20, fontSize: 16 
  },
  button: { backgroundColor: COLORS.primary, width: '100%', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});