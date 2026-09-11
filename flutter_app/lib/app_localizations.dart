import 'package:flutter/material.dart';

class AppText {
  static const Map<String, String> mr = {
    'Instant Services for Your Security':'तुमच्या सुरक्षेसाठी झटपट सेवा',
    'Instant Services':'इन्स्टंट सर्व्हिसेस',
    'Secure access to your service portal':'तुमच्या सर्व्हिस पोर्टलमध्ये सुरक्षित प्रवेश',
    'Email':'ईमेल','Password':'पासवर्ड','LOGIN':'साइन इन','Admin Dashboard':'ॲडमिन डॅशबोर्ड','Technician Portal':'टेक्निशियन पोर्टल','Customer Dashboard':'ग्राहक डॅशबोर्ड',
    'Connected to Unique Market Service backend.':'Unique Market Service बॅकएंडशी कनेक्टेड.',
    'Complaints':'तक्रारी','Raise and track service complaints':'तक्रार नोंदवा आणि ट्रॅक करा','Payments':'पेमेंट्स','View payment and UTR status':'पेमेंट आणि UTR स्टेटस पहा','Profile':'प्रोफाइल','View your account details':'तुमचे अकाउंट तपशील पहा',
    'Logout':'साइन आउट','English':'English','Marathi':'मराठी','Language':'भाषा',
    'Supabase is not configured.':'Supabase कॉन्फिगर केलेले नाही.'
  };

  static String of(BuildContext context, String english) {
    final isMarathi = Localizations.localeOf(context).languageCode == 'mr';
    return isMarathi ? (mr[english] ?? english) : english;
  }
}

String tr(BuildContext context, String english) => AppText.of(context, english);
