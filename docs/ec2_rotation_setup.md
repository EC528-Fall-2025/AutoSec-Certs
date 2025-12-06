# Certificate Rotation on AWS EC2 with HashiCorp Vault

This guide explains how to install the required tools, download the certificate-rotation script, and configure a systemd service and timer to run it automatically on an EC2 instance.


## 1. Install Vault CLI on the EC2 Instance

Follow HashiCorp’s official installation instructions.

```sh
sudo yum install -y yum-utils shadow-utils
sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
sudo yum install vault
```


## 2. Install jq

`jq` is needed to parse JSON responses from Vault.

```sh
sudo yum install -y jq
```


## 3. Download the Certificate Rotation Script

Download the script directly from the GitHub repository:

```sh
curl -o ec2_rotation_polling.sh \
https://raw.githubusercontent.com/EC528-Fall-2025/AutoSec-Certs/refs/heads/main/hashicorp_script_testing/ec2_rotation_polling.sh
```

Make the script executable:

```sh
sudo chmod 700 ec2_rotation_polling.sh
```


## 4. Create a systemd Service

Create the service file:

```sh
sudo vim /etc/systemd/system/cert-rotator.service
```

Paste the following:

```ini
[Unit]
Description=Vault certificate rotation

[Service]
Type=oneshot
ExecStart=<script location>
User=root
```

> Replace `<script location>` with the full path, for example:
> `/home/ec2-user/ec2_rotation_polling.sh`


## 5. Create a systemd Timer

Create the timer file:

```sh
sudo vim /etc/systemd/system/cert-rotator.timer
```

Paste:

```ini
[Unit]
Description=Run certificate rotator script every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

This runs the script every 5 minutes.


## 6. Enable and Start the Timer

Reload systemd so it picks up new unit files:

```sh
sudo systemctl daemon-reload
```

Enable and start the timer:

```sh
sudo systemctl enable --now cert-rotator.timer
```


## 7. Usage

### Check Timer Status

```sh
systemctl status cert-rotator.timer
```

### Manually Run the Script Through systemd

```sh
sudo systemctl start cert-rotator.service
```

### View Logs

```sh
journalctl -xeu cert-rotator.service
```


## Notes

* The script is expected to authenticate to Vault using the AWS auth method.
* Ensure the EC2 instance’s IAM role matches the the role you filled out on the ServiceNow form.
