import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, FlatList, 
  Alert, TextInput, Modal, ActivityIndicator, StatusBar, 
  SafeAreaView, KeyboardAvoidingView, Platform, Image 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Removed: import * as FileSystem from 'expo-file-system';  <-- Not needed anymore
// Removed: import { decode } from 'base64-arraybuffer';      <-- Not needed anymore
import { supabase } from '../lib/supabase';

const COLORS = {
  primary: '#4F46E5',    
  success: '#10B981',    
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
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [image, setImage] = useState(null); // Holds the image URI

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) Alert.alert("Error", error.message);
    else setProducts(data || []);
    setLoading(false);
  };

  // --- IMAGE PICKER ---
  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  // --- NEW UPLOAD METHOD (FIXES THE ERROR) ---
  const uploadImageToSupabase = async (uri) => {
    try {
      const fileName = `product_${Date.now()}.jpg`;

      // 1. Create a FormData object (Standard way to upload files)
      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        name: fileName,
        type: 'image/jpeg',
      });

      // 2. Upload using Supabase Storage API
      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, formData, {
          contentType: 'image/jpeg',
        });

      if (error) {
        // Fallback for some Expo versions: Convert to ArrayBuffer
        // If the above fails, this is the robust backup plan:
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: bufferError } = await supabase.storage
          .from('product-images')
          .upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
          });
          
        if (bufferError) throw bufferError;
      }

      // 3. Get Public URL
      const { data: publicData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      return publicData.publicUrl;
    } catch (error) {
      console.log("Upload Error:", error);
      Alert.alert("Upload Failed", error.message);
      return null;
    }
  };

  const handleSaveProduct = async () => {
    if (!name || !price || !stock) {
      Alert.alert("Missing Fields", "Please fill in Name, Price, and Stock.");
      return;
    }

    setLoading(true);
    
    // Upload image if it's a new local file
    let uploadedUrl = image;
    if (image && !image.startsWith('http')) {
      uploadedUrl = await uploadImageToSupabase(image);
    }

    const productData = {
      name: name,
      price: parseFloat(price),
      stock: parseInt(stock),
      image_url: uploadedUrl,
    };

    let error;
    if (isEditing) {
      const response = await supabase.from('products').update(productData).eq('id', editId);
      error = response.error;
    } else {
      const response = await supabase.from('products').insert([productData]);
      error = response.error;
    }

    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setModalVisible(false);
      resetForm();
      fetchProducts();
    }
  };

  const handleDelete = (id) => {
    Alert.alert("Confirm Delete", "Remove this item?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          await supabase.from('products').delete().eq('id', id);
          fetchProducts();
        }
      }
    ]);
  };

  const openAddModal = () => {
    setIsEditing(false);
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (item) => {
    setIsEditing(true);
    setEditId(item.id);
    setName(item.name);
    setPrice(item.price.toString());
    setStock(item.stock ? item.stock.toString() : '0');
    setImage(item.image_url);
    setModalVisible(true);
  };

  const resetForm = () => {
    setName('');
    setPrice('');
    setStock('');
    setImage(null);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.productImage} />
        ) : (
          <Ionicons name="cube" size={24} color={COLORS.primary} />
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardPrice}>₱{item.price.toFixed(2)}</Text>
        <Text style={styles.stockText}>Stock: {item.stock || 0}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.actionBtn}>
          <Ionicons name="create-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.dark} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory Manager</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.addBtnText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {loading && !modalVisible ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList 
          data={products}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No products found.</Text>}
        />
      )}

      {/* MODAL */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? "Edit Product" : "New Product"}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            {/* --- IMAGE PICKER UI --- */}
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {image ? (
                <Image source={{ uri: image }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="camera" size={30} color={COLORS.gray} />
                  <Text style={styles.imageText}>Tap to add photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Product Name</Text>
              <TextInput style={styles.input} placeholder="Item Name" value={name} onChangeText={setName} />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>Price (₱)</Text>
                <TextInput style={styles.input} placeholder="0.00" keyboardType="numeric" value={price} onChangeText={setPrice} />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Stock</Text>
                <TextInput style={styles.input} placeholder="0" keyboardType="number-pad" value={stock} onChangeText={setStock} />
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProduct}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Product</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: COLORS.dark, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...COLORS.cardShadow },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.white },
  addBtn: { flexDirection: 'row', backgroundColor: COLORS.primary, padding: 10, borderRadius: 8, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 5 },
  card: { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', padding: 15, marginBottom: 12, borderRadius: 12, ...COLORS.cardShadow },
  iconContainer: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 15, overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.dark },
  cardPrice: { fontSize: 14, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  stockText: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  cardActions: { flexDirection: 'row' },
  actionBtn: { padding: 8 },
  emptyText: { textAlign: 'center', marginTop: 50, color: COLORS.gray },
  
  // MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 15, padding: 20, ...COLORS.cardShadow },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: 'bold', color: COLORS.gray, marginBottom: 5, textTransform: 'uppercase' },
  input: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8, fontSize: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  row: { flexDirection: 'row' },
  saveBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  // IMAGE PICKER STYLES
  imagePicker: { 
    width: 100, height: 100, alignSelf: 'center', marginBottom: 20, 
    borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3F4F6', 
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' 
  },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center' },
  imageText: { fontSize: 10, color: COLORS.gray, marginTop: 5 },
});