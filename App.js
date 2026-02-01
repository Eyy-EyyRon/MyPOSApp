import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native'; // <--- Import Lottie

// --- SCREENS ---
import AuthScreen from './src/screens/AuthScreen';
import ManagerScreen from './src/screens/ManagerScreen';
import MerchantScreen from './src/screens/MerchantScreen';
import SalesScreen from './src/screens/SalesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { supabase } from './src/lib/supabase';

const Tab = createBottomTabNavigator();

export default function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [appIsReady, setAppIsReady] = useState(false); // Track animation state
  const animationProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Check Login Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
      else setUserRole(null);
    });
  }, []);

  const fetchUserRole = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('role, first_name, store_name') // Fetch store details too
      .eq('id', userId)
      .single();
    if (data) setUserRole(data);
  };

  // --- ANIMATION FINISH HANDLER ---
  const onAnimationFinish = () => {
    setAppIsReady(true);
  };

  // --- 1. SPLASH SCREEN COMPONENT ---
  if (!appIsReady) {
    return (
      <View style={styles.splashContainer}>
        <LottieView
          source={require('./assets/splash.json')} // <--- YOUR ANIMATION FILE HERE
          autoPlay
          loop={false}
          speed={1.5} // Adjust speed if needed
          onAnimationFinish={onAnimationFinish}
          style={styles.lottie}
        />
      </View>
    );
  }

  // --- 2. AUTH SCREEN (Login) ---
  if (!session) {
    return <AuthScreen />;
  }

  // --- 3. MAIN APP (After Login) ---
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'POS') iconName = focused ? 'calculator' : 'calculator-outline';
            else if (route.name === 'Manager') iconName = focused ? 'briefcase' : 'briefcase-outline';
            else if (route.name === 'Sales') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
            else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#4F46E5',
          tabBarInactiveTintColor: 'gray',
          tabBarStyle: { paddingBottom: 5, height: 60 },
        })}
      >
        {/* MERCHANT / POS TAB (Everyone sees this) */}
        <Tab.Screen name="POS">
          {() => <MerchantScreen user={userRole} />}
        </Tab.Screen>

        {/* MANAGER TABS (Only Manager sees these) */}
        {userRole?.role === 'manager' && (
          <>
            <Tab.Screen name="Manager" component={ManagerScreen} />
            <Tab.Screen name="Sales" component={SalesScreen} />
            <Tab.Screen name="Settings">
              {() => <SettingsScreen user={userRole} />}
            </Tab.Screen>
          </>
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#ffffff', // Background color of splash screen
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: 300,
    height: 300,
  },
});