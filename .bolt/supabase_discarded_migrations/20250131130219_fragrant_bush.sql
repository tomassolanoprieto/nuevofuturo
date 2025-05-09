-- Drop existing function if exists
DROP FUNCTION IF EXISTS send_pin_email;

-- Create improved function to send PIN email with better error handling
CREATE OR REPLACE FUNCTION send_pin_email(p_email TEXT, p_pin TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_response JSONB;
  v_status INTEGER;
BEGIN
  -- Send email using pg_net and capture response
  SELECT 
    status,
    COALESCE(response_body::jsonb, '{}'::jsonb) as response
  INTO v_status, v_response
  FROM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', format('Bearer %s', 're_7YE8fqQo_JAJ2ootxZtSpVDAbS7WTH7uQ'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Nuevo Futuro <no-reply@nuevofuturo.org>',
      'to', p_email,
      'subject', 'Tu PIN de acceso - Nuevo Futuro',
      'html', format('
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb; margin-bottom: 20px;">Tu PIN de acceso</h1>
          <p style="margin-bottom: 20px;">Hola,</p>
          <p style="margin-bottom: 20px;">Has solicitado tu PIN de acceso para el Portal de Empleado de Nuevo Futuro.</p>
          <p style="margin-bottom: 20px;">Tu PIN es: <strong style="font-size: 24px; color: #2563eb;">%s</strong></p>
          <p style="margin-bottom: 20px;">Puedes usar este PIN para iniciar sesión en el Portal de Empleado.</p>
          <p style="color: #666; font-size: 14px;">Por razones de seguridad, te recomendamos no compartir este PIN con nadie.</p>
        </div>
      ', p_pin)
    )
  );

  -- Log response for debugging
  RAISE NOTICE 'Email send attempt to % - Status: %, Response: %', p_email, v_status, v_response;

  -- Check response status
  IF v_status >= 200 AND v_status < 300 THEN
    RETURN TRUE;
  ELSE
    RAISE NOTICE 'Failed to send email. Status: %, Response: %', v_status, v_response;
    RETURN FALSE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Log detailed error
    RAISE NOTICE 'Error sending email to %: % (SQLSTATE: %)', p_email, SQLERRM, SQLSTATE;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION send_pin_email TO authenticated;