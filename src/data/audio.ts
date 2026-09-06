export const reciters = [
  { id: 'ar.alafasy', name: 'مشاري العفاسي' },
  { id: 'ar.husary', name: 'محمود خليل الحصري' },
  { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد' },
  { id: 'ar.minshawi', name: 'محمد صديق المنشاوي' },
];
// Phase two supplies only reciter metadata and per-ayah audio URLs.
// Quran text stays in versioned local assets, independent of this provider.
export const audioProvider = {
  getAudioUrl: (
    _surah: number,
    _ayah: number,
    _reciter: string,
  ): string | null => null,
};
