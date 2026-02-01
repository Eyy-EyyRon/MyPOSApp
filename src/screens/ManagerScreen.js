import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, TextInput, Modal, ActivityIndicator, StatusBar, 
  SafeAreaView, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import AddMerchantScreen from './AddMerchantScreen';

// --- THEME ---
const COLORS = {
  primary: '#100b6b',    
  success: '#143988',    
  danger: '#EF4444',     
  dark: '#111827',       
  gray: '#6B7280',       
  light: '#F3F4F6',      
  white: '#FFFFFF',
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  }
};

export default function ManagerScreen() {
  const [currentView, setCurrentView] = useState('inventory');
  
  // Inventory State
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [image, setImage] = useState(null);
  const [storeName, setStoreName] = useState(null);

  // Staff State
  const [staffList, setStaffList] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  // --- 1. INITIAL LOAD ---
  useFocusEffect(
    useCallback(() => {
      console.log("🔄 Screen Focused: Fetching Data...");
      fetchUser();
      fetchStaff();
    }, [])
  );

  // --- 2. REAL-TIME SUBSCRIPTION ---
  useEffect(() => {
    if (!storeName) return;

    console.log(`📡 Subscribing to updates for store: ${storeName}`);
    const subscription = supabase
      .channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        
        const relevantStore = payload.new?.store_name || payload.old?.store_name;
        // console.log("Realtime Event:", payload.eventType, "Store:", relevantStore);

        if (relevantStore !== storeName) return;

        if (payload.eventType === 'INSERT') {
          setProducts(prev => [payload.new, ...prev]);
        } 
        else if (payload.eventType === 'UPDATE') {
          setProducts(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
        } 
        else if (payload.eventType === 'DELETE') {
          setProducts(prev => prev.filter(item => item.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [storeName]); 

  // --- 3. DATA FETCHING ---
  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log("❌ No logged in user found");
        return;
      }

      console.log("✅ User ID:", user.id);
      setCurrentUser(user);
      
      // Fetch Profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('store_name')
        .eq('id', user.id)
        .single();
        
      if (error) {
        console.error("❌ Profile Fetch Error:", error.message);
        // Important: If manual SQL ID doesn't match Auth ID, this fails.
        return;
      }

      if (profile) {
        console.log("✅ Store Found:", profile.store_name);
        setStoreName(profile.store_name);
        fetchProducts(profile.store_name); 
      } else {
        console.log("❌ Profile is null (ID mismatch?)");
      }
    } catch (e) {
      console.error("Fetch User Exception:", e);
    }
  };

  const fetchProducts = async (specificStoreName) => {
    // Removed the 'currentView' check to ensure data loads in background
    const targetStore = specificStoreName || storeName; 
    
    if (!targetStore) {
      console.log("⚠️ Cannot fetch products: No Store Name");
      return;
    }

    setLoading(true);
    console.log(`📦 Fetching products for: ${targetStore}`);
    
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('store_name', targetStore)
      .order('name');

    if (error) {
      Alert.alert("Error", error.message);
      console.error("❌ Product Fetch Error:", error.message);
    } else {
      console.log(`✅ Loaded ${data.length} products`);
      setProducts(data || []);
    }
    setLoading(false);
  };

  const fetchStaff = async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'merchant').order('first_name');
    if (!error) setStaffList(data || []);
  };

  // --- 4. PRODUCT ACTIONS ---
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const uploadImageToSupabase = async (uri) => {
    try {
      const fileName = `product_${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri: uri, name: fileName, type: 'image/jpeg' });
      const { error } = await supabase.storage.from('product-images').upload(fileName, formData, { contentType: 'image/jpeg' });
      if (error) {
        const response = await fetch(uri);
        const blob = await response.blob();
        await supabase.storage.from('product-images').upload(fileName, blob);
      }
      const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
      return data.publicUrl;
    } catch (err) {
      console.log(err);
      return null;
    }
  };

  const handleSaveProduct = async () => {
    if (!name || !price || !stock) return Alert.alert("Missing Fields", "Check Name, Price, and Stock.");
    if (!storeName) return Alert.alert("Error", "Store Name not loaded. Try reloading the app.");
    
    setLoading(true);
    
    let uploadedUrl = image;
    if (image && !image.startsWith('http')) {
      uploadedUrl = await uploadImageToSupabase(image);
    }

    const productData = { 
      name, 
      price: parseFloat(price), 
      stock: parseInt(stock), 
      image_url: uploadedUrl,
      store_name: storeName 
    };
    
    let error;
    if (isEditing) {
      const res = await supabase.from('products').update(productData).eq('id', editId);
      error = res.error;
    } else {
      const res = await supabase.from('products').insert([productData]);
      error = res.error;
    }

    setLoading(false);
    if (error) Alert.alert("Error", error.message);
    else {
      setModalVisible(false);
      resetForm();
    }
  };

  const handleDeleteProduct = (id) => {
    Alert.alert("Delete", "Remove this item?", [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          await supabase.from('products').delete().eq('id', id);
      }}
    ]);
  };

  const openAddModal = () => { setIsEditing(false); resetForm(); setModalVisible(true); };
  const openEditModal = (item) => { setIsEditing(true); setEditId(item.id); setName(item.name); setPrice(item.price.toString()); setStock(item.stock.toString()); setImage(item.image_url); setModalVisible(true); };
  const resetForm = () => { setName(''); setPrice(''); setStock(''); setImage(null); };

  // --- 5. RENDER HELPERS ---
  
  if (currentView === 'add_staff') {
    return (
      <AddMerchantScreen 
        managerId={currentUser?.id} 
        onBack={() => { setCurrentView('staff'); fetchStaff(); }} 
      />
    );
  }

  const renderProductItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} /> : <Ionicons name="cube" size={24} color={COLORS.primary} />}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardPrice}>₱{item.price.toFixed(2)}</Text>
        <Text style={styles.stockText}>Stock: {item.stock}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
          <Ionicons name="create-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteProduct(item.id)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStaffItem = ({ item }) => (
    <View style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor: '#DEF7EC' }]}>
        <Ionicons name="person" size={24} color={COLORS.success} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.stockText}>{item.store_name || "No Store Assigned"}</Text>
        <Text style={[styles.stockText, {color: COLORS.gray}]}>{item.email || "Merchant User"}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Add and Assign</Text>
      </View>
      
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, currentView === 'inventory' && styles.activeTab]} onPress={() => setCurrentView('inventory')}>
          <Text style={[styles.tabText, currentView === 'inventory' && styles.activeTabText]}>Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, currentView === 'staff' && styles.activeTab]} onPress={() => { setCurrentView('staff'); fetchStaff(); }}>
          <Text style={[styles.tabText, currentView === 'staff' && styles.activeTabText]}>Staff</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {currentView === 'inventory' ? (
          <>
            <TouchableOpacity style={styles.addBtnBlock} onPress={openAddModal}>
              <Ionicons name="add-circle" size={24} color={COLORS.white} />
              <Text style={styles.addBtnText}>Add New Product</Text>
            </TouchableOpacity>
            
            {loading ? <ActivityIndicator color={COLORS.primary} style={{marginTop:20}} /> : (
              <FlatList 
                data={products} 
                renderItem={renderProductItem} 
                keyExtractor={item => item.id.toString()} 
                contentContainerStyle={{ paddingBottom: 100 }}
                ListEmptyComponent={<Text style={styles.emptyText}>No products found.</Text>}
              />
            )}
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.addBtnBlock, { backgroundColor: COLORS.success }]} onPress={() => setCurrentView('add_staff')}>
              <Ionicons name="person-add" size={24} color={COLORS.white} />
              <Text style={styles.addBtnText}>Register New Merchant</Text>
            </TouchableOpacity>

            <FlatList 
              data={staffList} 
              renderItem={renderStaffItem} 
              keyExtractor={item => item.id.toString()} 
              contentContainerStyle={{ paddingBottom: 100 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No staff found.</Text>}
            />
          </>
        )}
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? "Edit Product" : "New Product"}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {image ? (
                <Image source={{ uri: image }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="camera" size={30} color={COLORS.gray} />
                  <Text style={styles.imageText}>Photo</Text>
                </View>
              )}
            </TouchableOpacity>
            
            <TextInput style={styles.input} placeholder="Product Name" value={name} onChangeText={setName} />
            
            <View style={styles.row}>
              <TextInput style={[styles.input, { flex: 1, marginRight: 10 }]} placeholder="Price" keyboardType="numeric" value={price} onChangeText={setPrice} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Stock" keyboardType="number-pad" value={stock} onChangeText={setStock} />
            </View>
            
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProduct}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: COLORS.dark, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 15, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.white },
  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.white, padding: 5, margin: 15, borderRadius: 12, ...COLORS.cardShadow },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: COLORS.dark },
  tabText: { fontWeight: 'bold', color: COLORS.gray },
  activeTabText: { color: COLORS.white },
  content: { flex: 1, paddingHorizontal: 15 },
  addBtnBlock: { flexDirection: 'row', backgroundColor: COLORS.primary, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 20, ...COLORS.cardShadow },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },
  card: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', padding: 15, marginBottom: 12, borderRadius: 12, ...COLORS.cardShadow },
  iconContainer: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 15, overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  cardPrice: { fontSize: 14, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  stockText: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  cardActions: { flexDirection: 'row' },
  actionBtn: { padding: 8 },
  emptyText: { textAlign: 'center', marginTop: 50, color: COLORS.gray },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 15, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  input: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  row: { flexDirection: 'row' },
  saveBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  imagePicker: { width: 80, height: 80, alignSelf: 'center', marginBottom: 20, borderRadius: 10, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center' },
  imageText: { fontSize: 10, color: COLORS.gray }
});