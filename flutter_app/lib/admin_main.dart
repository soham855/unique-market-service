import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config/supabase_config.dart';
import 'services/auth_service.dart';
import 'services/admin_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SharedPreferences.getInstance();
  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(url: SupabaseConfig.url, publishableKey: SupabaseConfig.publishableKey);
  }
  runApp(const AdminApp());
}

class AdminApp extends StatelessWidget {
  const AdminApp({super.key});
  @override Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Unique Market Admin',
    theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF0B63F6), scaffoldBackgroundColor: const Color(0xFFF7F9FC)),
    home: SupabaseConfig.isConfigured ? const AdminSessionGate() : const Scaffold(body: Center(child: Text('Supabase is not configured.'))),
  );
}

class AdminSessionGate extends StatelessWidget {
  const AdminSessionGate({super.key});
  @override Widget build(BuildContext context) => Supabase.instance.client.auth.currentSession == null ? const AdminLoginPage() : const AdminHomePage();
}

class AdminLoginPage extends StatefulWidget {
  const AdminLoginPage({super.key});
  @override State<AdminLoginPage> createState() => _AdminLoginPageState();
}
class _AdminLoginPageState extends State<AdminLoginPage> {
  final mobile = TextEditingController(), otp = TextEditingController();
  bool sent=false,busy=false;
  String phone() { var p=mobile.text.trim(); if(p.startsWith('0'))p='+91'+p.substring(1); if(!p.startsWith('+'))p='+91'+p; return p; }
  Future<void> send() async { setState(()=>busy=true); try { await AuthService(Supabase.instance.client).sendOtp(phone()); if(mounted)setState(()=>sent=true); } catch(e) { if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString()))); } finally { if(mounted)setState(()=>busy=false); } }
  Future<void> verify() async { setState(()=>busy=true); try {
    final r=await AuthService(Supabase.instance.client).verifyOtp(phone:phone(),token:otp.text);
    if(r.user==null)throw Exception('OTP verification failed.');
    final role=await AuthService(Supabase.instance.client).resolveRole(r.user!.id);
    if(role!='admin'){await Supabase.instance.client.auth.signOut();throw Exception('This account is not an Admin account.');}
    if(mounted)Navigator.pushAndRemoveUntil(context,MaterialPageRoute(builder:(_)=>const AdminHomePage()),(_)=>false);
  } catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString())));} finally {if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(body:SafeArea(child:Center(child:SingleChildScrollView(padding:const EdgeInsets.all(24),child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:460),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    const Icon(Icons.admin_panel_settings_outlined,size:58,color:Color(0xFF0B63F6)),const SizedBox(height:18),
    const Text('UNIQUE MARKET',style:TextStyle(fontSize:28,fontWeight:FontWeight.w900,letterSpacing:1.2)),const Text('Admin Service Portal'),
    const SizedBox(height:36),Text(sent?'Verify OTP':'Admin Login',style:const TextStyle(fontSize:25,fontWeight:FontWeight.w800)),const SizedBox(height:18),
    if(!sent)TextField(controller:mobile,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Registered Admin Mobile',prefixIcon:Icon(Icons.phone_outlined)))
    else TextField(controller:otp,keyboardType:TextInputType.number,maxLength:6,decoration:const InputDecoration(labelText:'OTP',prefixIcon:Icon(Icons.lock_outline))),
    const SizedBox(height:12),SizedBox(width:double.infinity,height:54,child:FilledButton(onPressed:busy?null:(sent?verify:send),child:busy?const CircularProgressIndicator(color:Colors.white):Text(sent?'VERIFY & CONTINUE':'SEND OTP'))),
    if(sent)TextButton(onPressed:()=>setState(()=>sent=false),child:const Text('Change mobile number')),
    const SizedBox(height:28),const Text('CCTV | IT Security | Service & AMC',style:TextStyle(fontWeight:FontWeight.w700)),const Text('Station Road, Hotel Rajdoot, Ichalkaranji\n7350060071',style:TextStyle(color:Colors.black54))
  ]))))));
}

class AdminHomePage extends StatefulWidget { const AdminHomePage({super.key}); @override State<AdminHomePage> createState()=>_AdminHomePageState(); }
class _AdminHomePageState extends State<AdminHomePage> {
  final service=AdminService(Supabase.instance.client);
  Map<String,dynamic>? summary; List<Map<String,dynamic>> complaints=[]; List<Map<String,dynamic>> technicians=[]; int tab=0; bool loading=true;
  @override void initState(){super.initState();load();}
  Future<void> load() async { try { final s=await service.summary(); final c=await service.complaints(); final t=await service.technicians(); if(mounted)setState(()=>{summary=s,complaints=c,technicians=t,loading=false}); } catch(e){if(mounted)setState(()=>loading=false);}}
  Future<void> logout() async {await Supabase.instance.client.auth.signOut();if(mounted)Navigator.pushAndRemoveUntil(context,MaterialPageRoute(builder:(_)=>const AdminLoginPage()),(_)=>false);}
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Admin Dashboard',style:TextStyle(fontWeight:FontWeight.w800)),actions:[IconButton(onPressed:load,icon:const Icon(Icons.refresh)),PopupMenuButton<String>(onSelected:(v){if(v=='logout')logout();},itemBuilder:(_)=>const[PopupMenuItem(value:'logout',child:Text('Logout'))])]),
    body:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(16),children:[
      const Text('UNIQUE MARKET',style:TextStyle(fontSize:13,fontWeight:FontWeight.w800,letterSpacing:1.4)),const SizedBox(height:4),const Text('Operations Dashboard',style:TextStyle(fontSize:26,fontWeight:FontWeight.w900)),
      const SizedBox(height:18),_grid(),
      const SizedBox(height:22),const Text('Live Complaints',style:TextStyle(fontSize:20,fontWeight:FontWeight.w800)),const SizedBox(height:10),
      ...complaints.take(10).map((c)=>AdminComplaintTile(complaint:c,technicians:technicians,onChanged:load)),
      if(complaints.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(22),child:Text('No complaints found.'))),
      const SizedBox(height:20),const Center(child:Text('UNIQUE MARKET • 7350060071',style:TextStyle(color:Colors.black45)))
    ])),
    bottomNavigationBar:NavigationBar(selectedIndex:tab,onDestinationSelected:(i){setState(()=>tab=i);if(i==1)Navigator.push(context,MaterialPageRoute(builder:(_)=>ComplaintsPage(service:service))).then((_){load();});else if(i==2)Navigator.push(context,MaterialPageRoute(builder:(_)=>CustomersPage(service:service)));else if(i==3)Navigator.push(context,MaterialPageRoute(builder:(_)=>TechniciansPage(service:service)));},destinations:const[
      NavigationDestination(icon:Icon(Icons.dashboard_outlined),label:'Dashboard'),NavigationDestination(icon:Icon(Icons.confirmation_num_outlined),label:'Complaints'),NavigationDestination(icon:Icon(Icons.people_outline),label:'Customers'),NavigationDestination(icon:Icon(Icons.engineering_outlined),label:'Technicians')
    ])
  );
  Widget _grid()=>GridView.count(crossAxisCount:2,shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),crossAxisSpacing:10,mainAxisSpacing:10,childAspectRatio:1.45,children:[
    _metric('Open',summary!['open'].toString(),Icons.pending_actions_outlined),_metric('New',summary!['new'].toString(),Icons.fiber_new_outlined),_metric('In Service',summary!['in_service'].toString(),Icons.build_circle_outlined),_metric('Completed',summary!['completed'].toString(),Icons.check_circle_outline),_metric('Technicians',summary!['technicians'].toString(),Icons.engineering_outlined),_metric('Collected','₹'+(summary!['collected'] as double).toStringAsFixed(0),Icons.payments_outlined)
  ]);
  Widget _metric(String title,String value,IconData icon)=>Card(child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(icon,color:const Color(0xFF0B63F6)),const SizedBox(height:5),Text(value,style:const TextStyle(fontSize:21,fontWeight:FontWeight.w900)),Text(title,style:const TextStyle(color:Colors.black54))])));
}

class AdminComplaintTile extends StatelessWidget {
  final Map<String,dynamic> complaint; final List<Map<String,dynamic>> technicians; final VoidCallback onChanged;
  const AdminComplaintTile({super.key,required this.complaint,required this.technicians,required this.onChanged});
  @override Widget build(BuildContext context)=>Card(child:ListTile(
    leading:const CircleAvatar(child:Icon(Icons.confirmation_num_outlined)),
    title:Text((complaint['ticket_no']??complaint['complaint_no']??'Complaint').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),
    subtitle:Text((complaint['customer_name']??'Customer').toString()+' • '+(complaint['service_type']??complaint['category']??'Service').toString(),maxLines:2,overflow:TextOverflow.ellipsis),
    trailing:Chip(label:Text((complaint['status']??'New').toString())),
    onTap:()=>showModalBottomSheet(context:context,isScrollControlled:true,builder:(_)=>AdminComplaintSheet(complaint:complaint,technicians:technicians,onChanged:onChanged))
  ));
}

class AdminComplaintSheet extends StatefulWidget {
  final Map<String,dynamic> complaint; final List<Map<String,dynamic>> technicians; final VoidCallback onChanged;
  const AdminComplaintSheet({super.key,required this.complaint,required this.technicians,required this.onChanged});
  @override State<AdminComplaintSheet> createState()=>_AdminComplaintSheetState();
}
class _AdminComplaintSheetState extends State<AdminComplaintSheet>{
  final service=AdminService(Supabase.instance.client); String? techId; DateTime? visitAt; final note=TextEditingController(); bool busy=false;
  @override void initState(){super.initState();techId=widget.complaint['technician_id']?.toString(); final v=widget.complaint['scheduled_visit_at']; if(v!=null)visitAt=DateTime.tryParse(v.toString())?.toLocal();}
  Future<void> save() async {if(techId==null||techId!.isEmpty){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Select a technician.')));return;}setState(()=>busy=true);try{await service.assignComplaint(widget.complaint['id'].toString(),techId!,visitAt,note:note.text);if(mounted){Navigator.pop(context);widget.onChanged();ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Technician assigned.')));}}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString())));}finally{if(mounted)setState(()=>busy=false);}}
  @override Widget build(BuildContext context)=>Padding(padding:EdgeInsets.only(bottom:MediaQuery.of(context).viewInsets.bottom),child:ListView(shrinkWrap:true,padding:const EdgeInsets.all(18),children:[
    Text((widget.complaint['ticket_no']??widget.complaint['complaint_no']??'Complaint').toString(),style:const TextStyle(fontSize:23,fontWeight:FontWeight.w900)),const SizedBox(height:10),
    _row('Customer',widget.complaint['customer_name']),_row('Mobile',widget.complaint['customer_phone']),_row('Service',widget.complaint['service_type']),_row('Problem',widget.complaint['category']),_row('Address',widget.complaint['address']??widget.complaint['location_text']),_row('Status',widget.complaint['status']),
    const SizedBox(height:14),const Text('Assign Technician',style:TextStyle(fontSize:17,fontWeight:FontWeight.w800)),const SizedBox(height:8),
    DropdownButtonFormField<String>(value:techId,decoration:const InputDecoration(labelText:'Technician'),items:widget.technicians.map((t)=>DropdownMenuItem(value:t['id'].toString(),child:Text((t['name']??t['mobile']??t['id']).toString()))).toList(),onChanged:(v)=>setState(()=>techId=v)),
    const SizedBox(height:12),ListTile(contentPadding:EdgeInsets.zero,title:Text(visitAt==null?'Schedule Visit':visitAt.toString()),leading:const Icon(Icons.schedule),onTap:()async{final d=await showDatePicker(context:context,firstDate:DateTime.now(),lastDate:DateTime.now().add(const Duration(days:90)),initialDate:visitAt??DateTime.now());if(d==null||!mounted)return;final t=await showTimePicker(context:context,initialTime:TimeOfDay.now());if(t!=null)setState(()=>visitAt=DateTime(d.year,d.month,d.day,t.hour,t.minute));}),
    TextField(controller:note,maxLines:2,decoration:const InputDecoration(labelText:'Internal Note')),const SizedBox(height:14),
    SizedBox(height:52,child:FilledButton(onPressed:busy?null:save,child:busy?const CircularProgressIndicator(color:Colors.white):const Text('ASSIGN & SCHEDULE')))
  ]));
  Widget _row(String l,dynamic v)=>Padding(padding:const EdgeInsets.only(bottom:7),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[SizedBox(width:85,child:Text(l,style:const TextStyle(color:Colors.black54))),Expanded(child:Text(v?.toString()??'-',style:const TextStyle(fontWeight:FontWeight.w600)))]));
}

class ComplaintsPage extends StatefulWidget { final AdminService service; const ComplaintsPage({super.key,required this.service}); @override State<ComplaintsPage> createState()=>_ComplaintsPageState(); }
class _ComplaintsPageState extends State<ComplaintsPage>{String status='All';List<Map<String,dynamic>> rows=[];bool loading=true;final tabs=['All','New','Assigned','Scheduled','On The Way','Reached','In Service','Completed'];
 @override void initState(){super.initState();load();}Future<void>load()async{try{rows=await widget.service.complaints(status:status);if(mounted)setState(()=>loading=false);}catch(_){if(mounted)setState(()=>loading=false);}}
 @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Complaints')),body:Column(children:[SingleChildScrollView(scrollDirection:Axis.horizontal,padding:const EdgeInsets.all(12),child:Row(children:tabs.map((s)=>Padding(padding:const EdgeInsets.only(right:8),child:ChoiceChip(label:Text(s),selected:status==s,onSelected:(_){setState(()=>status=s);load();}))).toList())),Expanded(child:loading?const Center(child:CircularProgressIndicator()):RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.fromLTRB(12,0,12,18),children:rows.map((c)=>AdminComplaintTile(complaint:c,technicians:[],onChanged:load)).toList())))]));
}

class CustomersPage extends StatefulWidget { final AdminService service; const CustomersPage({super.key,required this.service}); @override State<CustomersPage> createState()=>_CustomersPageState(); }
class _CustomersPageState extends State<CustomersPage>{List<Map<String,dynamic>> rows=[];bool loading=true;@override void initState(){super.initState();load();}Future<void>load()async{try{rows=await widget.service.customers();if(mounted)setState(()=>loading=false);}catch(_){if(mounted)setState(()=>loading=false);}}@override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Customers')),body:loading?const Center(child:CircularProgressIndicator()):ListView.builder(padding:const EdgeInsets.all(12),itemCount:rows.length,itemBuilder:(_,i){final c=rows[i];return Card(child:ListTile(leading:const CircleAvatar(child:Icon(Icons.person_outline)),title:Text((c['name']??'Customer').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),subtitle:Text((c['customer_code']??'-').toString()+' • '+(c['mobile']??'-').toString()),trailing:const Icon(Icons.chevron_right)));}));
}

class TechniciansPage extends StatefulWidget { final AdminService service; const TechniciansPage({super.key,required this.service}); @override State<TechniciansPage> createState()=>_TechniciansPageState(); }
class _TechniciansPageState extends State<TechniciansPage>{List<Map<String,dynamic>> rows=[];bool loading=true;@override void initState(){super.initState();load();}Future<void>load()async{try{rows=await widget.service.technicians();if(mounted)setState(()=>loading=false);}catch(_){if(mounted)setState(()=>loading=false);}}@override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Technicians')),body:loading?const Center(child:CircularProgressIndicator()):ListView.builder(padding:const EdgeInsets.all(12),itemCount:rows.length,itemBuilder:(_,i){final t=rows[i];return Card(child:ListTile(leading:const CircleAvatar(child:Icon(Icons.engineering_outlined)),title:Text((t['name']??'Technician').toString(),style:const TextStyle(fontWeight:FontWeight.w800)),subtitle:Text((t['mobile']??'-').toString()),trailing:Chip(label:Text('Active'))));}));}
