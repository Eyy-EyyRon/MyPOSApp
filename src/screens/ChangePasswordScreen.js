import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ChangePasswordScreen({ onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    // 1. Update Password in Auth System
    const { error: authError } = await supabase.auth.updateUser({ 
      password: newPassword 
    });

    if (authError) {
      Alert.alert("Error", authError.message);
      setLoading(false);
      return;
    }

    // 2. Update Profile to say "I changed my password!"
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ is_password_changed: true })
      .eq('id', (await supabase.auth.getUser()).data.user.id);

    setLoading(false);

    if (dbError) {
      Alert.alert("Error", "Password saved but profile update failed.");
    } else {
      Alert.alert("Success", "Password updated successfully!");
      onPasswordChanged(); // Tell App.js we are done
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Setup Security</Text>
        <Text style={styles.subtitle}>
          Your manager created this account. Please set a new personal password to continue.
        </Text>

        <TextInput 
          style={styles.input} 
          placeholder="New Password" 
          secureTextEntry 
          value={newPassword}
          onChangeText={setNewPassword}
        />

        <TouchableOpacity style={styles.button} onPress={handleChange} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update Password & Login</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', padding: 30, borderRadius: 15, elevation: 5 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: '#F9FAFB', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 20 },
  button: { backgroundColor: '#10B981', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});