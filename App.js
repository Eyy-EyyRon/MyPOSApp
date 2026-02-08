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
          <View style={styles.iconCircle}><Ionicons name="cash" size={24} color={COLORS.success} /></View>
          <View style={{flex: 1}}>
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
  
  // 🎬 INITIAL LOAD STATE (True only for the very first cold start)
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
        fetchUserRole(session.user.id); // Fetch data, but keep Splash active until done
      } else {
        setAppIsReady(true); // No user? Ready to show Auth Screen
      }
    });

    // 2. Listen for Auth Changes (Login / Logout)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      
      if (session) {
        // ⚠️ FIX: Do NOT set appIsReady(false) here. 
        // This prevents the Splash Screen from showing up again during login.
        setProfileError(false);
        fetchUserRole(session.user.id);
      } else {
        // Logout
        setUserRole(null);
        setAppIsReady(true); // Ensure Auth screen shows
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userRole || userRole.role !== 'manager' || userRole.notifications_enabled === false) return;

    const subscription = supabase
      .channel('public:sales')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
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
          // Retry logic (silent, doesn't trigger splash)
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
      // Mark app as ready (removes splash screen if it was the first load)
      setAppIsReady(true);
    }
  };

  const handlePasswordUpdateComplete = () => {
    if (session?.user?.id) fetchUserRole(session.user.id);
  };

  // 🎬 SPLASH SCREEN (Only shows on Cold Start)
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

  // --- MAIN CONTENT ---
  const renderContent = () => {
    if (!session) return <AuthScreen />;
    
    // ⏳ LOADING STATE (Shows Spinner instead of Splash during login)
    if (!userRole) {
      return (
        <View style={styles.splashContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    if (userRole.status === 'banned') return <AuthScreen isBanned={true} />; 
    if (userRole.must_change_password) return <ChangePasswordScreen onPasswordChanged={handlePasswordUpdateComplete} />;

    const isOwner = userRole?.role === 'owner';
    const isManager = userRole?.role === 'manager';

    return (
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: { 
              height: Platform.OS === 'android' ? 100 : 95, 
              paddingBottom: Platform.OS === 'android' ? 40 : 35, 
              paddingTop: 12,
              backgroundColor: '#ffffff',
              borderTopWidth: 0,
              elevation: 20,
              shadowColor: '#000', shadowOffset: { width: 0, height: -5 },
              shadowOpacity: 0.1, shadowRadius: 10,
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
            },
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
          {isOwner ? (
            <>
              <Tab.Screen name="Admin" component={OwnerScreen} />
              <Tab.Screen name="Settings" component={SettingsScreen} />
            </>
          ) : (
            <>
              <Tab.Screen name="POS">
                {() => <MerchantScreen user={userRole} />}
              </Tab.Screen>

              {isManager && (
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
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {renderContent()}
      <NotificationBanner visible={notifVisible} message={notifMessage} onClose={() => setNotifVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  notificationWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 9999, paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  notificationContent: {
    margin: 15, backgroundColor: 'white', borderRadius: 16, padding: 15,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
    borderLeftWidth: 5, borderLeftColor: COLORS.success
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DEF7EC', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  notifTitle: { fontWeight: 'bold', fontSize: 16, color: COLORS.dark, marginBottom: 2 },
  notifBody: { color: '#555', fontSize: 14 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#FFF' },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.dark, marginTop: 20 },
  errorText: { fontSize: 15, color: '#666', textAlign: 'center', marginVertical: 15, lineHeight: 22 },
  retryBtn: { marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  retryText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  logoutBtn: { marginTop: 15, paddingVertical: 12, width: '100%', alignItems: 'center' },
  logoutText: { color: COLORS.danger, fontWeight: 'bold', fontSize: 16 }
});