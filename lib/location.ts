// lib/location.ts
import * as Location from "expo-location";

export async function getUserLocation() {
  // 1) Ask permission clearly and only when needed
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    // Caller should fall back to ZIP/city input
    throw new Error("permission_denied");
  }

  // 2) Get coordinates (balanced accuracy)
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  });

  // 3) Reverse-geocode for city/ZIP (nice to show in UI)
  const places = await Location.reverseGeocodeAsync({
    latitude: coords.latitude,
    longitude: coords.longitude,
  });

  const place = places[0];
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    city: place?.city ?? null,
    region: place?.region ?? null,
    postalCode: place?.postalCode ?? null,
    country: place?.country ?? null,
    timestamp: Date.now(),
  };
}
