import React, { useEffect, useState, useRef } from 'react';
import { 
  View, Text, StyleSheet, ActivityIndicator, Platform, Alert, Animated, SafeAreaView, TouchableOpacity 
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native'; 

// --- SCREENS ---
import AuthScreen from './src/screens/AuthScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import MerchantScreen from './src/screens/MerchantScreen';
import SalesScreen from './src/screens/SalesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OwnerScreen from './src/screens/OwnerScreen'; 
import { supabase } from './src/lib/supabase';

const Tab = createBottomTabNavigator();
const COLORS = { primary: '#130f5f', dark: '#111827', success: '#10B981', white: '#FFF', danger: '#EF4444' };

// --- CUSTOM NOTIFICATION COMPONENT ---
const NotificationBanner = ({ message, visible, onClose }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      const timer = setTimeout(() => closeBanner(), 4000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const closeBanner = () => {
    Animated.timing(slideAnim, { toValue: -150, duration: 300, useNativeDriver: true }).start(() => onClose());
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.notificationWrapper, { transform: [{ translateY: slideAnim }] }]}>
      <SafeAreaView>
        <TouchableOpacity style={styles.notificationContent} onPress={closeBanner} activeOpacity={0.9}>
          <View style={styles.iconCircle}>
            <Ionicons name="cash" size={24} color={COLORS.success} />
          </View>
          <View style={{flex: 1, marginLeft: 10}}>
            <Text style={styles.notifTitle}>New Sale! 💰</Text>
            <Text style={styles.notifBody}>{message}</Text>
          </View>
          <Ionicons name="close" size={20} color="#999" />
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  
  // 🎬 INITIAL LOAD STATE
  const [appIsReady, setAppIsReady] = useState(false);
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);
  const [profileError, setProfileError] = useState(false);

  // Notification State
  const [notifVisible, setNotifVisible] = useState(false);
  const [notifMessage, setNotifMessage] = useState("");

  useEffect(() => {
    // 1. Initial Session Check (Cold Start)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserRole(session.user.id); 
      } else {
        setAppIsReady(true); 
      }
    });

    // 2. Listen for Auth Changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      if (session) {
        setProfileError(false);
        fetchUserRole(session.user.id);
      } else {
        setUserRole(null);
        setAppIsReady(true);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  // 🔔 Real-time Sales Notification (Manager Only)
  useEffect(() => {
    if (!userRole || userRole.role !== 'manager') return;

    const subscription = supabase
      .channel('public:sales')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        // Only trigger if it belongs to the manager's store
        if (payload.new.store_name === userRole.store_name) {
          triggerInAppNotification(`Received ₱${payload.new.total_amount} from ${payload.new.cashier_name}`);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [userRole]); 

  const triggerInAppNotification = (message) => {
    setNotifMessage(message);
    setNotifVisible(true);
  };

  const fetchUserRole = async (userId, retries = 3) => {
    try {
      console.log(`Fetching profile for: ${userId}`);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*') 
        .eq('id', userId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116' && retries > 0) {
          setTimeout(() => fetchUserRole(userId, retries - 1), 1000);
          return;
        }
        throw error;
      }

      if (data) {
        setUserRole(data);
        setProfileError(false);
      }
    } catch (e) {
      console.log("Fetch Failed:", e.message);
      if (retries === 0) setProfileError(true);
    } finally {
      setAppIsReady(true);
    }
  };

  const handlePasswordUpdateComplete = () => {
    if (session?.user?.id) fetchUserRole(session.user.id);
  };

  // 🎬 SPLASH SCREEN
  if (!appIsReady || !isAnimationFinished) {
    return (
      <View style={styles.splashContainer}>
        <LottieView
          source={require('./assets/splash.json')} 
          autoPlay loop={false} resizeMode="cover"
          onAnimationFinish={() => setIsAnimationFinished(true)}
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }

  // 🚨 ERROR STATE
  if (profileError && session) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={COLORS.danger} />
        <Text style={styles.errorTitle}>Profile Not Found</Text>
        <Text style={styles.errorText}>
          We found your login, but your user profile is missing.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchUserRole(session.user.id, 5)}>
          <Text style={styles.retryText}>Retry Loading</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- MAIN CONTENT RENDERER ---
  return (
    <View style={{ flex: 1 }}>
      {/* If not logged in, show Auth */}
      {!session ? (
        <AuthScreen />
      ) : !userRole ? (
        // Loading Spinner while fetching Role
        <View style={styles.splashContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : userRole.status === 'banned' ? (
        <AuthScreen isBanned={true} />
      ) : userRole.must_change_password || userRole.is_new_user ? ( 
        // Force Password Change Logic
        <ChangePasswordScreen onPasswordChanged={handlePasswordUpdateComplete} />
      ) : (
        // Main App Navigation
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarStyle: styles.tabBar,
              tabBarIcon: ({ focused, color, size }) => {
                let iconName;
                if (route.name === 'POS') iconName = focused ? 'calculator' : 'calculator-outline';
                else if (route.name === 'Inventory') iconName = focused ? 'briefcase' : 'briefcase-outline';
                else if (route.name === 'Sales') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
                else if (route.name === 'Admin') iconName = focused ? 'shield' : 'shield-outline';
                else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
                return <Ionicons name={iconName} size={size} color={color} />;
              },
              tabBarActiveTintColor: COLORS.primary,
              tabBarInactiveTintColor: '#9CA3AF',
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: -5 }
            })}
          >
            {userRole.role === 'owner' ? (
              // OWNER TABS
              <>
                <Tab.Screen name="Admin" component={OwnerScreen} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
              </>
            ) : (
              // MERCHANT / MANAGER TABS
              <>
                <Tab.Screen name="POS">
                  {() => <MerchantScreen user={userRole} />}
                </Tab.Screen>

                {userRole.role === 'manager' && (
                  <>
                    <Tab.Screen name="Inventory" component={ManagerScreen} />
                    <Tab.Screen name="Sales" component={SalesScreen} />
                  </>
                )}
                <Tab.Screen name="Settings" component={SettingsScreen} />
              </>
            )}
          </Tab.Navigator>
        </NavigationContainer>
      )}

      {/* Global Notification Banner */}
      <NotificationBanner visible={notifVisible} message={notifMessage} onClose={() => setNotifVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  notificationWrapper: {
    position: 'absolute', top: 50, left: 20, right: 20, zIndex: 9999,
  },
  notificationContent: {
    backgroundColor: 'white', borderRadius: 16, padding: 15,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
    borderLeftWidth: 5, borderLeftColor: COLORS.success
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DEF7EC', justifyContent: 'center', alignItems: 'center' },
  notifTitle: { fontWeight: 'bold', fontSize: 16, color: COLORS.dark, marginBottom: 2 },
  notifBody: { color: '#555', fontSize: 14 },
  
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#FFF' },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark, marginTop: 20 },
  errorText: { fontSize: 15, color: '#666', textAlign: 'center', marginVertical: 15, lineHeight: 22 },
  retryBtn: { marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  retryText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  logoutBtn: { marginTop: 15, paddingVertical: 12, width: '100%', alignItems: 'center' },
  logoutText: { color: COLORS.danger, fontWeight: 'bold', fontSize: 16 },

  tabBar: { 
    height: Platform.OS === 'android' ? 70 : 85, 
    paddingBottom: Platform.OS === 'android' ? 10 : 25, 
    paddingTop: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    elevation: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1, shadowRadius: 10,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  }
});