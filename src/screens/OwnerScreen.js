import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function OwnerScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch ALL profiles
  const fetchUsers = async () => {
    setLoading(true);
    // Owners can see everyone due to the RLS policy we set earlier
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) Alert.alert("Error", error.message);
    else setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Toggle Ban/Unban
  const toggleVerification = async (id, currentStatus) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_verified: !currentStatus })
      .eq('id', id);

    if (error) {
      Alert.alert("Update Failed", error.message);
    } else {
      // Update local list instantly
      setUsers(users.map(u => u.id === id ? { ...u, is_verified: !currentStatus } : u));
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>
          {item.first_name} {item.last_name}
          {item.role === 'owner' && <Text style={{color: 'gold'}}> (YOU)</Text>}
        </Text>
        <Text style={styles.details}>Role: {item.role.toUpperCase()}</Text>
        <Text style={styles.details}>Store: {item.store_name || "N/A"}</Text>
      </View>

      <View style={styles.action}>
        <Text style={[styles.status, { color: item.is_verified ? 'green' : 'red' }]}>
          {item.is_verified ? "Active" : "Banned"}
        </Text>
        {item.role !== 'owner' && (
          <Switch
            value={item.is_verified}
            onValueChange={() => toggleVerification(item.id, item.is_verified)}
          />
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Owner Dashboard</Text>
      <Text style={styles.subHeader}>Manage System Access</Text>

      <FlatList
        data={users}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        refreshing={loading}
        onRefresh={fetchUsers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', paddingTop: 50, paddingHorizontal: 20 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#1F2937' },
  subHeader: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  card: { 
    flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 12, 
    marginBottom: 10, alignItems: 'center', justifyContent: 'space-between', elevation: 2 
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  details: { fontSize: 12, color: '#6B7280' },
  action: { alignItems: 'flex-end' },
  status: { fontSize: 12, fontWeight: 'bold', marginBottom: 5 }
});