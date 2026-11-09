import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'services/customer_service.dart';

class CustomerAiServiceAssistantPage extends StatefulWidget {
  const CustomerAiServiceAssistantPage({super.key});

  @override
  State<CustomerAiServiceAssistantPage> createState() => _CustomerAiServiceAssistantPageState();
}

class _CustomerAiServiceAssistantPageState extends State<CustomerAiServiceAssistantPage> {
  final _issue = TextEditingController();
  final _address = TextEditingController();
  final _service = CustomerService(Supabase.instance.client);
  Map<String, dynamic>? _customer;
  Map<String, dynamic>? _diagnosis;
  bool _loading = true;
  bool _submitting = false;
  String _message = '';

  static const _rules = <Map<String, dynamic>>[
    {
      'keys': ['camera', 'cctv', 'cam'],
      'title': 'Camera is not working',
      'category': 'CCTV',
      'problem': 'Camera Not Working',
      'steps': [
        'Check whether the camera power supply indicator is ON.',
        'For PoE cameras, check the PoE port light and LAN cable.',
        'Check whether the camera appears Online or Offline in the CCTV app.',
        'If only one camera is affected, inspect its connector and cable.',
      ],
    },
    {
      'keys': ['recording', 'record', 'playback', 'hdd'],
      'title': 'Recording / playback problem',
      'category': 'DVR/NVR',
      'problem': 'Camera Recording Problem',
      'steps': [
        'Check whether the DVR/NVR shows the hard disk as Normal or Healthy.',
        'Open Playback and select the affected camera and time range.',
        'Confirm the recorder date and time are correct.',
        'Do not format a disk showing an error before support checks it.',
      ],
    },
    {
      'keys': ['black screen', 'no video', 'display'],
      'title': 'No video / black screen',
      'category': 'CCTV',
      'problem': 'No Video / Black Screen',
      'steps': [
        'Check camera power and connector connections.',
        'Try another channel to identify whether the issue is camera-side or recorder-side.',
        'For a monitor issue, check the HDMI/VGA cable and selected input.',
      ],
    },
    {
      'keys': ['offline', 'not online', 'network', 'internet'],
      'title': 'Camera or device appears offline',
      'category': 'Networking',
      'problem': 'Network Disconnection',
      'steps': [
        'Check the router, network cable and PoE connections.',
        'Check whether other cameras are also offline.',
        'If every camera is offline, the router or recorder network may be affected.',
      ],
    },
    {
      'keys': ['mobile', 'app', 'remote', 'viewing'],
      'title': 'Mobile / remote viewing problem',
      'category': 'CCTV',
      'problem': 'Mobile Viewing Problem',
      'steps': [
        'Confirm that your phone has an internet connection.',
        'Check whether the CCTV device is Online in the mobile app.',
        'If it is offline, inspect the recorder network cable and router.',
        'Never share your CCTV password in chat or with unknown callers.',
      ],
    },
    {
      'keys': ['blur', 'blurry', 'clear', 'quality'],
      'title': 'Image quality problem',
      'category': 'CCTV',
      'problem': 'Blurred / Low Quality Video',
      'steps': [
        'Gently clean the camera lens with a soft, dry cloth.',
        'Check whether the issue occurs during daytime, nighttime or both.',
        'Do not climb or open electrical equipment; request a technician if access is unsafe.',
      ],
    },
  ];

  @override
  void initState() {
    super.initState();
    _loadCustomer();
  }

  Future<void> _loadCustomer() async {
    try {
      _customer = await _service.customer();
      _address.text = (_customer?['address'] ?? '').toString();
    } catch (error) {
      _message = 'Could not load your customer profile: ' + error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  void _analyse() {
    final text = _issue.text.trim().toLowerCase();
    if (text.isEmpty) {
      setState(() => _message = 'Describe your CCTV or IT issue first.');
      return;
    }
    Map<String, dynamic>? match;
    for (final rule in _rules) {
      final keys = List<String>.from(rule['keys'] as List);
      if (keys.any(text.contains)) {
        match = rule;
        break;
      }
    }
    setState(() {
      _diagnosis = match;
      _message = match == null
          ? 'I could not confidently identify this issue. You can still create a service request for a technician.'
          : 'I understood the issue. Try these safe checks first.';
    });
  }

  Future<void> _createComplaint() async {
    if (_customer == null) {
      setState(() => _message = 'Your customer profile is not linked. Please contact Unique Market.');
      return;
    }
    if (_address.text.trim().isEmpty) {
      setState(() => _message = 'Enter the service address before creating a request.');
      return;
    }
    setState(() {
      _submitting = true;
      _message = '';
    });
    try {
      final ticket = await _service.createComplaint(
        category: (_diagnosis?['problem'] ?? 'Other CCTV / IT Problem').toString(),
        serviceType: (_diagnosis?['category'] ?? 'CCTV').toString(),
        description: 'AI Service Assistant\nCustomer issue: ' + _issue.text.trim() +
            (_diagnosis == null
                ? '\nIssue needs technician diagnosis.'
                : '\nSuggested checks: ' +
                    List<String>.from(_diagnosis!['steps'] as List).join(' | ')),
        address: _address.text.trim(),
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Service request created'),
          content: Text('Ticket: ' +
              (ticket['ticket_no'] ?? ticket['complaint_no'] ?? ticket['id']).toString()),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) setState(() => _message = 'Could not create complaint: ' + error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _issue.dispose();
    _address.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('AI Service Assistant')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.support_agent_outlined, size: 36),
                          SizedBox(height: 10),
                          Text('Tell us your CCTV problem',
                              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                          SizedBox(height: 6),
                          Text('Describe the issue in Marathi or English. The assistant will suggest safe basic checks.'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _issue,
                    minLines: 3,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: 'Describe your problem',
                      hintText: 'उदा. Camera बंद आहे / Recording दिसत नाही',
                      alignLabelWithHint: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _analyse,
                    icon: const Icon(Icons.auto_awesome),
                    label: const Text('Analyse Problem'),
                  ),
                  if (_diagnosis != null) ...[
                    const SizedBox(height: 14),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_diagnosis!['title'].toString(),
                                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 10),
                            const Text('Basic troubleshooting',
                                style: TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            ...List<String>.from(_diagnosis!['steps'] as List).asMap().entries.map(
                                  (entry) => Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Text((entry.key + 1).toString() + '. ' + entry.value),
                                  ),
                                ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  TextField(
                    controller: _address,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'Service Address',
                      hintText: 'Enter the address where service is required',
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _submitting ? null : _createComplaint,
                    icon: const Icon(Icons.confirmation_number_outlined),
                    label: Text(_submitting ? 'Creating request…' : 'Create Service Complaint'),
                  ),
                  if (_message.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(_message, style: TextStyle(color: _message.startsWith('Could not') ? Colors.red : null)),
                  ],
                ],
              ),
      );
}

class CustomerServiceHistoryPage extends StatefulWidget {
  final void Function(Map<String, dynamic> ticket) onOpenTicket;
  const CustomerServiceHistoryPage({super.key, required this.onOpenTicket});

  @override
  State<CustomerServiceHistoryPage> createState() => _CustomerServiceHistoryPageState();
}

class _CustomerServiceHistoryPageState extends State<CustomerServiceHistoryPage> {
  final _service = CustomerService(Supabase.instance.client);
  List<Map<String, dynamic>> _tickets = [];
  DateTime _selectedDate = DateTime.now();
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _tickets = await _service.tickets();
      _tickets.sort((a, b) => (b['created_at'] ?? '').toString().compareTo((a['created_at'] ?? '').toString()));
      _error = '';
    } catch (error) {
      _error = error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  bool _sameDay(Map<String, dynamic> ticket) {
    final date = DateTime.tryParse((ticket['created_at'] ?? '').toString())?.toLocal();
    return date != null &&
        date.year == _selectedDate.year &&
        date.month == _selectedDate.month &&
        date.day == _selectedDate.day;
  }

  @override
  Widget build(BuildContext context) {
    final selected = _tickets.where(_sameDay).toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Service History'),
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  CalendarDatePicker(
                    initialDate: _selectedDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                    onDateChanged: (date) => setState(() => _selectedDate = date),
                  ),
                  const SizedBox(height: 8),
                  Text('Service records on ' +
                      _selectedDate.day.toString().padLeft(2, '0') + '/' +
                      _selectedDate.month.toString().padLeft(2, '0') + '/' +
                      _selectedDate.year.toString(),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  if (_error.isNotEmpty) Text(_error, style: const TextStyle(color: Colors.red)),
                  if (selected.isEmpty)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(22),
                        child: Center(child: Text('No service record on this date. Select another date.')),
                      ),
                    ),
                  ...selected.map((ticket) => Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          leading: const Icon(Icons.history),
                          title: Text((ticket['ticket_no'] ?? ticket['complaint_no'] ?? ticket['title'] ?? 'Service Request').toString()),
                          subtitle: Text(
                            (ticket['category'] ?? ticket['service_type'] ?? 'Service').toString() +
                                '\nStatus: ' + (ticket['status'] ?? 'New').toString(),
                          ),
                          isThreeLine: true,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => widget.onOpenTicket(ticket),
                        ),
                      )),
                  const SizedBox(height: 16),
                  const Text('All service requests', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ..._tickets.map((ticket) => Card(
                        child: ListTile(
                          title: Text((ticket['ticket_no'] ?? ticket['complaint_no'] ?? ticket['title'] ?? 'Service Request').toString()),
                          subtitle: Text((ticket['created_at'] ?? '').toString() + ' • ' + (ticket['status'] ?? 'New').toString()),
                          onTap: () => widget.onOpenTicket(ticket),
                        ),
                      )),
                ],
              ),
            ),
    );
  }
}

class CustomerFeedbackPage extends StatefulWidget {
  const CustomerFeedbackPage({super.key});

  @override
  State<CustomerFeedbackPage> createState() => _CustomerFeedbackPageState();
}

class _CustomerFeedbackPageState extends State<CustomerFeedbackPage> {
  final _service = CustomerService(Supabase.instance.client);
  List<Map<String, dynamic>> _tickets = [];
  Map<String, Map<String, dynamic>> _feedback = {};
  bool _loading = true;
  String _message = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final customer = await _service.customer();
      if (customer == null) throw Exception('Customer profile not found.');
      _tickets = await _service.tickets();
      final rows = await Supabase.instance.client
          .from('service_feedback')
          .select('complaint_id,rating,comment')
          .eq('customer_id', customer['id']);
      _feedback = {
        for (final row in rows)
          row['complaint_id'].toString(): Map<String, dynamic>.from(row),
      };
      _message = '';
    } catch (error) {
      _message = 'Could not load feedback: ' + error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  bool _completed(Map<String, dynamic> ticket) {
    final status = (ticket['status'] ?? '').toString().toLowerCase();
    return ['resolved', 'closed', 'completed'].contains(status);
  }

  Future<void> _rate(Map<String, dynamic> ticket) async {
    final id = ticket['id'].toString();
    final previous = _feedback[id];
    int rating = int.tryParse((previous?['rating'] ?? '').toString()) ?? 0;
    final comment = TextEditingController(text: (previous?['comment'] ?? '').toString());
    final result = await showDialog<int>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Rate your service'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                alignment: WrapAlignment.center,
                children: List.generate(5, (index) {
                  final value = index + 1;
                  return IconButton(
                    onPressed: () => setDialogState(() => rating = value),
                    icon: Icon(value <= rating ? Icons.star : Icons.star_border,
                        color: Colors.amber, size: 32),
                  );
                }),
              ),
              TextField(
                controller: comment,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Feedback (optional)'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCEL')),
            FilledButton(
              onPressed: rating == 0 ? null : () => Navigator.pop(context, rating),
              child: const Text('SUBMIT'),
            ),
          ],
        ),
      ),
    );
    if (result == null) {
      comment.dispose();
      return;
    }
    try {
      final customer = await _service.customer();
      if (customer == null) throw Exception('Customer profile not found.');
      await Supabase.instance.client.from('service_feedback').upsert({
        'complaint_id': id,
        'customer_id': customer['id'],
        'rating': result,
        'comment': comment.text.trim().isEmpty ? null : comment.text.trim(),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }, onConflict: 'complaint_id');
      comment.dispose();
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Feedback saved. Thank you!')));
      await launchUrl(
        Uri.parse('https://maps.app.goo.gl/tV6TUsacb9CtqibY8?g_st=ac'),
        mode: LaunchMode.externalApplication,
      );
    } catch (error) {
      comment.dispose();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not save feedback: ' + error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final completed = _tickets.where(_completed).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Feedback'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text('Your completed services', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  if (_message.isNotEmpty) Text(_message, style: const TextStyle(color: Colors.red)),
                  if (completed.isEmpty)
                    const Card(child: Padding(padding: EdgeInsets.all(22), child: Text('Feedback becomes available after a service is completed.'))),
                  ...completed.map((ticket) {
                    final id = ticket['id'].toString();
                    final existing = _feedback[id];
                    final stars = int.tryParse((existing?['rating'] ?? '').toString()) ?? 0;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        title: Text((ticket['ticket_no'] ?? ticket['complaint_no'] ?? 'Completed service').toString()),
                        subtitle: Text('Your rating: ' + (stars == 0 ? 'Not rated' : stars.toString() + '/5')),
                        trailing: const Icon(Icons.star_outline),
                        onTap: () => _rate(ticket),
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }
}

class CustomerReferralPage extends StatefulWidget {
  const CustomerReferralPage({super.key});

  @override
  State<CustomerReferralPage> createState() => _CustomerReferralPageState();
}

class _CustomerReferralPageState extends State<CustomerReferralPage> {
  final _client = Supabase.instance.client;
  Map<String, dynamic>? _customer;
  Map<String, dynamic>? _code;
  List<Map<String, dynamic>> _rules = [];
  List<Map<String, dynamic>> _history = [];
  final _name = TextEditingController();
  final _mobile = TextEditingController();
  final _company = TextEditingController();
  bool _loading = true;
  bool _submitting = false;
  String _message = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  String _newCode(String name) {
    final cleaned = name.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '').toUpperCase();
    final prefixLength = cleaned.length < 5 ? cleaned.length : 5;
    final prefix = cleaned.isEmpty ? 'CUSTOMER' : cleaned.substring(0, prefixLength);
    final suffix = DateTime.now().microsecondsSinceEpoch.toRadixString(36).toUpperCase();
    final suffixStart = suffix.length > 5 ? suffix.length - 5 : 0;
    return 'UM' + prefix + suffix.substring(suffixStart);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _message = '';
    });
    try {
      _customer = await CustomerService(_client).customer();
      if (_customer == null) throw Exception('Customer record is not linked to this login.');
      final existing = await _client
          .from('customer_referral_codes')
          .select('*')
          .eq('customer_id', _customer!['id'])
          .maybeSingle();
      if (existing != null) {
        _code = Map<String, dynamic>.from(existing);
      } else {
        final created = await _client.from('customer_referral_codes').insert({
          'customer_id': _customer!['id'],
          'code': _newCode((_customer!['name'] ?? 'Customer').toString()),
        }).select('*').single();
        _code = Map<String, dynamic>.from(created);
      }
      final rules = await _client.from('referral_rules').select('*').eq('active', true).order('created_at');
      _rules = List<Map<String, dynamic>>.from(rules);
      final history = await _client
          .from('referrals')
          .select('*')
          .eq('referrer_customer_id', _customer!['id'])
          .order('created_at', ascending: false);
      _history = List<Map<String, dynamic>>.from(history);
    } catch (error) {
      _message = 'Could not load referral details: ' + error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    final mobile = _mobile.text.replaceAll(RegExp(r'\D'), '');
    if (name.isEmpty || mobile.length != 10) {
      setState(() => _message = 'Enter the customer name and a valid 10-digit mobile number.');
      return;
    }
    if (_customer == null || _code == null) {
      setState(() => _message = 'Referral account is not ready. Refresh and try again.');
      return;
    }
    setState(() {
      _submitting = true;
      _message = '';
    });
    try {
      final rule = _rules.isEmpty ? null : _rules.first;
      final rewardValue = num.tryParse((rule?['reward_value'] ?? 500).toString()) ?? 500;
      final payload = {
        'referral_code_id': _code!['id'],
        'referrer_customer_id': _customer!['id'],
        'referred_name': name,
        'referred_mobile': mobile,
        'referred_company': _company.text.trim().isEmpty ? null : _company.text.trim(),
        'reward_type': rule?['reward_type'] ?? 'cash',
        'reward_value': rewardValue,
        'reward_text': rule?['reward_text'] ?? 'Reward after successful conversion',
      };
      await _client.from('referrals').insert(payload);
      try {
        final admins = await _client.from('profiles').select('id').eq('role', 'admin');
        if (admins.isNotEmpty) {
          await _client.from('notifications').insert(
            List<Map<String, dynamic>>.from(admins).map((admin) => {
              'user_id': admin['id'],
              'title': 'New Customer Referral',
              'message': (_customer!['name'] ?? 'Customer').toString() +
                  ' referred ' + name + ' (' + mobile + ').',
              'type': 'customer_referral',
            }).toList(),
          );
        }
      } catch (_) {
        // Referral creation is the primary action; notification failures must not duplicate it.
      }
      _name.clear();
      _mobile.clear();
      _company.clear();
      if (mounted) {
        setState(() => _message = 'Referral submitted successfully.');
        await _load();
      }
    } catch (error) {
      if (mounted) setState(() => _message = 'Could not submit referral: ' + error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _copyCode() async {
    final code = (_code?['code'] ?? '').toString();
    if (code.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Referral code copied.')));
  }

  Future<void> _shareCode() async {
    final code = (_code?['code'] ?? '').toString();
    if (code.isEmpty) return;
    final message = 'Join Unique Market service support. Use my referral code: ' + code;
    await launchUrl(
      Uri.parse('https://wa.me/?text=' + Uri.encodeComponent(message)),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _mobile.dispose();
    _company.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Referral System'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Your Referral Code', style: TextStyle(fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            SelectableText((_code?['code'] ?? 'Not available').toString(),
                                style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
                            const SizedBox(height: 10),
                            Wrap(
                              spacing: 8,
                              children: [
                                OutlinedButton.icon(onPressed: _code == null ? null : _copyCode, icon: const Icon(Icons.copy), label: const Text('Copy')),
                                FilledButton.icon(onPressed: _code == null ? null : _shareCode, icon: const Icon(Icons.share), label: const Text('Share on WhatsApp')),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Refer a Customer', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 12),
                            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Customer Name')),
                            const SizedBox(height: 10),
                            TextField(controller: _mobile, keyboardType: TextInputType.phone, maxLength: 10, decoration: const InputDecoration(labelText: 'Mobile Number')),
                            const SizedBox(height: 10),
                            TextField(controller: _company, decoration: const InputDecoration(labelText: 'Company (Optional)')),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: _submitting ? null : _submit,
                                child: Text(_submitting ? 'Submitting…' : 'Submit Referral'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_message.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(_message)),
                    const SizedBox(height: 12),
                    const Text('Active Reward Rules', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    ..._rules.map((rule) => Card(
                          child: ListTile(
                            title: Text((rule['reward_text'] ?? rule['name'] ?? 'Reward').toString()),
                            subtitle: Text((rule['qualifying_condition'] ?? 'Reward after successful conversion.').toString()),
                          ),
                        )),
                    const SizedBox(height: 12),
                    const Text('Referral History', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                    if (_history.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(18), child: Text('No referrals yet.'))),
                    ..._history.map((item) => Card(
                          child: ListTile(
                            title: Text((item['referred_name'] ?? 'Referral').toString()),
                            subtitle: Text((item['referred_mobile'] ?? '').toString() + ' • ' +
                                (item['created_at'] ?? '').toString() + '\n' +
                                (item['reward_text'] ?? '').toString()),
                            isThreeLine: true,
                            trailing: Text((item['status'] ?? 'pending').toString().toUpperCase()),
                          ),
                        )),
                  ],
                ),
              ),
      );
}


class CustomerProfileEditPage extends StatefulWidget {
  const CustomerProfileEditPage({super.key});

  @override
  State<CustomerProfileEditPage> createState() => _CustomerProfileEditPageState();
}

class _CustomerProfileEditPageState extends State<CustomerProfileEditPage> {
  final _client = Supabase.instance.client;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _company = TextEditingController();
  final _address = TextEditingController();
  final _email = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String _message = '';
  String _error = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final user = _client.auth.currentUser;
      if (user == null) throw Exception('Please sign in again.');
      final row = await _client.from('profiles')
          .select('full_name,phone,company_name,site_address')
          .eq('id', user.id)
          .maybeSingle();
      if (row != null) {
        _name.text = (row['full_name'] ?? '').toString();
        _phone.text = (row['phone'] ?? '').toString();
        _company.text = (row['company_name'] ?? '').toString();
        _address.text = (row['site_address'] ?? '').toString();
      }
      _email.text = user.email ?? '';
    } catch (error) {
      _error = error.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _save() async {
    final user = _client.auth.currentUser;
    if (user == null) {
      setState(() => _error = 'Please sign in again.');
      return;
    }
    if (_name.text.trim().isEmpty || _phone.text.trim().isEmpty) {
      setState(() => _error = 'Name and mobile number are required.');
      return;
    }
    setState(() {
      _saving = true;
      _message = '';
      _error = '';
    });
    try {
      await _client.from('profiles').update({
        'full_name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'company_name': _company.text.trim().isEmpty ? null : _company.text.trim(),
        'site_address': _address.text.trim().isEmpty ? null : _address.text.trim(),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', user.id);

      final newEmail = _email.text.trim();
      if (newEmail.isNotEmpty && newEmail.toLowerCase() != (user.email ?? '').toLowerCase()) {
        await _client.auth.updateUser(UserAttributes(email: newEmail));
        _message = 'Profile saved. Confirm the email change using the verification email sent by Supabase.';
      } else {
        _message = 'Profile updated successfully.';
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_message)));
      }
    } catch (error) {
      _error = 'Could not save profile: ' + error.toString();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _company.dispose();
    _address.dispose();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Edit My Profile')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  const Text('Personal & Service Information',
                      style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 16),
                  TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full Name')),
                  const SizedBox(height: 12),
                  TextField(controller: _company, decoration: const InputDecoration(labelText: 'Company Name (Optional)')),
                  const SizedBox(height: 12),
                  TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Mobile Number')),
                  const SizedBox(height: 12),
                  TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email ID')),
                  const SizedBox(height: 12),
                  TextField(controller: _address, maxLines: 3, decoration: const InputDecoration(labelText: 'Site Address')),
                  if (_error.isNotEmpty) Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error, style: const TextStyle(color: Colors.red)),
                  ),
                  if (_message.isNotEmpty) Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_message, style: const TextStyle(color: Colors.green)),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _saving ? null : _save,
                      child: Text(_saving ? 'Saving…' : 'Save Changes'),
                    ),
                  ),
                ],
              ),
      );
}


class CustomerPortalPaymentsPage extends StatefulWidget {
  const CustomerPortalPaymentsPage({super.key});

  @override
  State<CustomerPortalPaymentsPage> createState() => _CustomerPortalPaymentsPageState();
}

class _CustomerPortalPaymentsPageState extends State<CustomerPortalPaymentsPage> {
  final _client = Supabase.instance.client;
  List<Map<String, dynamic>> _payments = [];
  List<Map<String, dynamic>> _challans = [];
  Map<String, dynamic>? _settings;
  String? _customerId;
  String _selectedId = '';
  final _utr = TextEditingController();
  bool _loading = true;
  bool _submitting = false;
  String _message = '';
  bool _messageIsError = false;

  Map<String, dynamic>? get _selected {
    for (final challan in _challans) {
      if (challan['id'].toString() == _selectedId) return challan;
    }
    return null;
  }

  double _number(dynamic value) => double.tryParse((value ?? 0).toString()) ?? 0;

  double get _balance {
    final selected = _selected;
    if (selected == null) return 0;
    return (_number(selected['subtotal']) - _number(selected['paid_amount'])).clamp(0, double.infinity);
  }

  bool get _upiEnabled => _settings?['is_enabled'] != false;
  String get _upiId => _upiEnabled ? (_settings?['upi_id'] ?? '').toString() : '';
  String get _accountName => (_settings?['account_name'] ?? 'Unique Market').toString();

  String get _qrUrl {
    if (_upiId.isEmpty) return '';
    final upi = 'upi://pay?pa=' + Uri.encodeComponent(_upiId) +
        '&pn=' + Uri.encodeComponent(_accountName) +
        '&am=' + _balance.toStringAsFixed(2) + '&cu=INR';
    return 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=' + Uri.encodeComponent(upi);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _message = '';
      });
    }
    try {
      final customer = await CustomerService(_client).customer();
      if (customer == null) throw Exception('Customer record is not linked to this login.');
      _customerId = customer['id'].toString();

      final results = await Future.wait([
        _client.from('payments')
            .select('id,payment_date,amount,mode,reference_no,status,payment_status,created_at,challan_id,challans(challan_no)')
            .eq('customer_id', _customerId!)
            .order('created_at', ascending: false)
            .limit(100),
        _client.from('challans')
            .select('id,challan_no,challan_date,subtotal,paid_amount,payment_status,status')
            .eq('customer_id', _customerId!)
            .inFilter('status', ['issued', 'completed'])
            .order('challan_date', ascending: false)
            .limit(100),
        _client.from('payment_settings')
            .select('upi_id,account_name,qr_image_url,is_enabled')
            .limit(1)
            .maybeSingle(),
      ]);

      _payments = List<Map<String, dynamic>>.from(results[0] as List);
      _challans = List<Map<String, dynamic>>.from(results[1] as List)
          .where((row) => _number(row['subtotal']) > _number(row['paid_amount']))
          .toList();
      _settings = results[2] == null ? null : Map<String, dynamic>.from(results[2] as Map);
      _message = '';
    } catch (error) {
      _message = 'Could not load payment details: ' + error.toString();
      _messageIsError = true;
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _submit() async {
    final selected = _selected;
    if (_customerId == null || selected == null || _balance <= 0) {
      setState(() {
        _message = 'Select an unpaid Call ID / Challan No.';
        _messageIsError = true;
      });
      return;
    }
    if (_upiId.isEmpty) {
      setState(() {
        _message = 'Online payment is not configured. Please contact Unique Market.';
        _messageIsError = true;
      });
      return;
    }
    if (_utr.text.trim().isEmpty) {
      setState(() {
        _message = 'UTR / transaction reference is mandatory.';
        _messageIsError = true;
      });
      return;
    }
    final alreadyPending = _payments.any((payment) =>
        payment['challan_id']?.toString() == _selectedId &&
        (payment['status'] ?? payment['payment_status'] ?? '').toString().toLowerCase().contains('pending'));
    if (alreadyPending) {
      setState(() {
        _message = 'A payment for this challan is already awaiting verification.';
        _messageIsError = true;
      });
      return;
    }

    setState(() {
      _submitting = true;
      _message = '';
    });
    try {
      await _client.from('payments').insert({
        'customer_id': _customerId,
        'challan_id': _selectedId,
        'payment_date': DateTime.now().toUtc().toIso8601String().substring(0, 10),
        'amount': _balance,
        'mode': 'UPI',
        'reference_no': _utr.text.trim(),
        'status': 'pending',
        'source': 'customer',
        'payment_status': 'Pending Verification',
        'notes': 'Customer QR payment — verification pending',
      });
      _utr.clear();
      setState(() {
        _selectedId = '';
        _message = 'Payment submitted successfully. Your UTR is pending verification by Unique Market.';
        _messageIsError = false;
      });
      await _load();
      if (mounted) {
        setState(() {
          _message = 'Payment submitted successfully. Your UTR is pending verification by Unique Market.';
          _messageIsError = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _message = 'Payment submission failed: ' + error.toString();
          _messageIsError = true;
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _utr.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final customQr = (_settings?['qr_image_url'] ?? '').toString();
    final qr = customQr.isNotEmpty ? customQr : _qrUrl;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payments'),
        actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text('Pay Service Bill', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  const Text('Select an unpaid Call ID / Challan No., scan the company QR, pay the exact amount, then submit your UTR.'),
                  if (_message.isNotEmpty) Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(_message, style: TextStyle(color: _messageIsError ? Colors.red : Colors.green)),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _selectedId.isEmpty ? null : _selectedId,
                    decoration: const InputDecoration(labelText: 'Call ID / Challan No.'),
                    items: _challans.map((challan) {
                      final balance = (_number(challan['subtotal']) - _number(challan['paid_amount'])).clamp(0, double.infinity);
                      return DropdownMenuItem(
                        value: challan['id'].toString(),
                        child: Text((challan['challan_no'] ?? 'Challan').toString() + ' • Balance ₹' + balance.toStringAsFixed(2)),
                      );
                    }).toList(),
                    onChanged: _upiId.isEmpty ? null : (value) => setState(() {
                      _selectedId = value ?? '';
                      _utr.clear();
                      _message = '';
                    }),
                  ),
                  if (_challans.isEmpty) const Card(
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('No unpaid challan found. Your outstanding bills will appear here.'),
                    ),
                  ),
                  if (selected != null) ...[
                    const SizedBox(height: 14),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          children: [
                            const Text('Scan & Pay to Unique Market', style: TextStyle(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 8),
                            Text('Amount: ₹' + _balance.toStringAsFixed(2),
                                style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900)),
                            if (_upiId.isNotEmpty) Text('UPI: ' + _upiId),
                            const SizedBox(height: 12),
                            if (qr.isNotEmpty)
                              Image.network(
                                qr,
                                width: 220,
                                height: 220,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => const SizedBox(
                                  width: 220,
                                  height: 220,
                                  child: Center(child: Text('QR image could not be loaded. Use the UPI ID above.')),
                                ),
                              ),
                            const SizedBox(height: 8),
                            const Text('Pay the exact displayed amount, then enter the UTR below.'),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _utr,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'UTR / Transaction Reference No.'),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _submitting || _utr.text.trim().isEmpty ? null : _submit,
                        child: Text(_submitting ? 'Submitting…' : 'Submit Payment & UTR'),
                      ),
                    ),
                  ],
                  if (_upiId.isEmpty) const Card(
                    child: Padding(
                      padding: EdgeInsets.all(14),
                      child: Text('Company UPI / QR is not configured. Please contact Unique Market.'),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text('Payment History', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900)),
                  if (_payments.isEmpty) const Card(
                    child: Padding(
                      padding: EdgeInsets.all(18),
                      child: Text('No payments recorded yet.'),
                    ),
                  ),
                  ..._payments.map((payment) {
                    final challan = payment['challans'];
                    final challanNo = challan is Map ? (challan['challan_no'] ?? '—').toString() : '—';
                    return Card(
                      child: ListTile(
                        leading: const Icon(Icons.receipt_long_outlined),
                        title: Text(challanNo),
                        subtitle: Text(
                          '₹' + _number(payment['amount']).toStringAsFixed(2) +
                              ' • ' + (payment['mode'] ?? '—').toString() +
                              '\n' + (payment['payment_status'] ?? payment['status'] ?? 'Pending').toString() +
                              ' • UTR: ' + (payment['reference_no'] ?? '—').toString(),
                        ),
                        isThreeLine: true,
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }
}
